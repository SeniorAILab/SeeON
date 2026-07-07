from __future__ import annotations

import json
import logging
import os
import queue
import shutil
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

import cv2

from contracts.frame import Frame

LOGGER = logging.getLogger(__name__)

CLIP_STORE_DIR_ENV = "CLIP_STORE_DIR"
CLIP_STORE_RETENTION_DAYS_ENV = "CLIP_STORE_RETENTION_DAYS"
CLIP_RETENTION_DAYS_ENV = "CLIP_RETENTION_DAYS"
CLIP_STORE_MAX_USAGE_ENV = "CLIP_STORE_MAX_USAGE"
CLIP_DISK_HIGH_WATERMARK_ENV = "CLIP_DISK_HIGH_WATERMARK"

DEFAULT_CLIP_STORE_DIR = "/var/lib/clip-store"
DEFAULT_RETENTION_DAYS = 30
DEFAULT_DISK_HIGH_WATERMARK = 0.80


@dataclass(frozen=True, slots=True)
class ClipRecorderConfig:
    store_dir: Path = field(
        default_factory=lambda: Path(_env_str(CLIP_STORE_DIR_ENV, DEFAULT_CLIP_STORE_DIR))
    )
    segment_seconds: float = 2.0
    pre_event_seconds: float = 10.0
    post_event_seconds: float = 20.0
    fps: float = 5.0
    retention_days: int = field(default_factory=lambda: _env_retention_days())
    disk_high_watermark: float = field(default_factory=lambda: _env_disk_high_watermark())
    max_queue_size: int = 128
    codec: str = "mp4v"


@dataclass(slots=True)
class ClipRecorderStats:
    dropped_frames: int = 0
    dropped_events: int = 0
    finalized_clips: int = 0
    failed_writes: int = 0
    video_unavailable_clips: int = 0


@dataclass(frozen=True, slots=True)
class _CodecSpec:
    codec: str
    suffix: str


# mp4v (software MPEG-4 in bundled ffmpeg) is browser-playable and reliable on
# headless OpenCV. avc1 is intentionally excluded: on CI/edge headless builds it
# resolves to the h264_v4l2m2m hardware encoder, which fails to initialize on
# machines without a V4L2 device. MJPG/.avi is the last-resort always-works fallback.
DEFAULT_CODEC_CANDIDATES = (
    _CodecSpec("mp4v", ".mp4"),
    _CodecSpec("MJPG", ".avi"),
)


@dataclass(frozen=True, slots=True)
class _FrameMessage:
    camera_id: str
    frame: Frame


@dataclass(frozen=True, slots=True)
class _EventMessage:
    camera_id: str
    event_ref: str
    clip_id: str


@dataclass(frozen=True, slots=True)
class _RotateMessage:
    done: threading.Event | None = None


@dataclass(frozen=True, slots=True)
class _StopMessage:
    done: threading.Event


_Message = _FrameMessage | _EventMessage | _RotateMessage | _StopMessage


@dataclass(slots=True)
class _Segment:
    camera_id: str
    path: Path
    start_time_sec: float
    end_time_sec: float
    started_at: datetime
    frame_count: int


@dataclass(slots=True)
class _OpenSegment:
    camera_id: str
    path: Path
    start_time_sec: float
    started_at: datetime
    writer: cv2.VideoWriter
    codec: str
    frame_count: int = 0
    end_time_sec: float = 0.0


@dataclass(slots=True)
class _CameraState:
    camera_id: str
    segment_dir: Path
    current: _OpenSegment | None = None
    closed_segments: list[_Segment] = field(default_factory=list)
    frame_size: tuple[int, int] | None = None
    last_time_sec: float | None = None


@dataclass(slots=True)
class _ActiveClip:
    camera_id: str
    event_ref: str
    clip_id: str
    event_time_sec: float
    cutoff_time_sec: float
    staging_dir: Path
    final_dir: Path
    tmp_video_path: Path
    final_video_path: Path | None
    manifest_path: Path
    writer: cv2.VideoWriter | None
    codec: str | None
    started_at: datetime
    start_time_sec: float
    last_time_sec: float
    video_error: str | None = None
    appended_paths: set[Path] = field(default_factory=set)
    frame_count: int = 0


class ClipRecorder:
    """Disk-backed edge evidence recorder.

    Frames and event notifications enter through a bounded queue so camera inference never
    waits for disk, encoding, rotation, or finalize work. The recorder keeps per-camera
    rolling segment files on disk and assembles event clips from those segment files.
    """

    def __init__(
        self,
        config: ClipRecorderConfig | None = None,
        *,
        disk_usage_provider: Callable[[Path], shutil._ntuple_diskusage] | None = None,
    ) -> None:
        self.config = ClipRecorderConfig() if config is None else config
        self.stats = ClipRecorderStats()
        self._queue: queue.Queue[_Message] = queue.Queue(maxsize=self.config.max_queue_size)
        self._thread: threading.Thread | None = None
        self._states: dict[str, _CameraState] = {}
        self._active_clips: list[_ActiveClip] = []
        self._disk_usage_provider = (
            shutil.disk_usage if disk_usage_provider is None else disk_usage_provider
        )
        self._lock = threading.Lock()
        self._codec_by_camera: dict[str, _CodecSpec] = {}

    @classmethod
    def from_env(cls) -> ClipRecorder:
        return cls(ClipRecorderConfig())

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self.config.store_dir.mkdir(parents=True, exist_ok=True)
        (self.config.store_dir / "segments").mkdir(parents=True, exist_ok=True)
        (self.config.store_dir / "clips" / ".staging").mkdir(parents=True, exist_ok=True)
        self._thread = threading.Thread(target=self._run, name="clip-recorder", daemon=True)
        self._thread.start()

    def stop(self, *, timeout: float = 5.0) -> None:
        done = threading.Event()
        self._put_control(_StopMessage(done))
        done.wait(timeout)
        if self._thread is not None:
            self._thread.join(timeout=timeout)

    def flush(self, *, timeout: float = 5.0) -> bool:
        done = threading.Event()
        if not self._put_control(_RotateMessage(done)):
            return False
        return done.wait(timeout)

    def rotate_once(self, *, timeout: float = 5.0) -> bool:
        return self.flush(timeout=timeout)

    def on_frame(self, camera_id: str, frame: Frame) -> bool:
        try:
            self._queue.put_nowait(_FrameMessage(camera_id=camera_id, frame=frame))
        except queue.Full:
            with self._lock:
                self.stats.dropped_frames += 1
            return False
        return True

    def on_event(self, camera_id: str, event_ref: str) -> str | None:
        clip_id = _clip_id(camera_id)
        try:
            self._queue.put_nowait(
                _EventMessage(camera_id=camera_id, event_ref=event_ref, clip_id=clip_id)
            )
        except queue.Full:
            with self._lock:
                self.stats.dropped_events += 1
            return None
        return clip_id

    @property
    def dropped_frame_count(self) -> int:
        return self.stats.dropped_frames

    @property
    def dropped_event_count(self) -> int:
        return self.stats.dropped_events

    def _put_control(self, message: _RotateMessage | _StopMessage) -> bool:
        try:
            self._queue.put_nowait(message)
        except queue.Full:
            return False
        return True

    def _run(self) -> None:
        while True:
            message = self._queue.get()
            try:
                if isinstance(message, _FrameMessage):
                    self._handle_frame(message)
                elif isinstance(message, _EventMessage):
                    self._handle_event(message)
                elif isinstance(message, _RotateMessage):
                    self._rotate()
                    if message.done is not None:
                        message.done.set()
                elif isinstance(message, _StopMessage):
                    self._close_all_open_segments()
                    self._finalize_ready_clips(force=True)
                    self._rotate()
                    message.done.set()
                    return
            except Exception as exc:  # noqa: BLE001 - recorder failures must not kill inference
                LOGGER.warning("clip recorder operation failed: %s", exc)
                with self._lock:
                    self.stats.failed_writes += 1
                if isinstance(message, (_RotateMessage, _StopMessage)):
                    message.done.set()
                    if isinstance(message, _StopMessage):
                        return
            finally:
                self._queue.task_done()

    def _handle_frame(self, message: _FrameMessage) -> None:
        state = self._state(message.camera_id)
        frame = message.frame
        image = frame.image
        height, width = image.shape[:2]
        frame_size = (width, height)
        if state.frame_size is None:
            state.frame_size = frame_size
        if state.current is None:
            state.current = self._open_segment(state, frame.time_sec, frame_size)
        elif frame.time_sec - state.current.start_time_sec >= self.config.segment_seconds:
            closed = self._close_segment(state)
            if closed is not None:
                self._append_segment_to_active_clips(closed)
            state.current = self._open_segment(state, frame.time_sec, frame_size)
        if state.current is None:
            return
        state.current.writer.write(_as_bgr(image))
        state.current.frame_count += 1
        state.current.end_time_sec = frame.time_sec
        state.last_time_sec = frame.time_sec
        self._finalize_ready_clips()
        self._prune_segment_ring(state)

    def _handle_event(self, message: _EventMessage) -> None:
        state = self._states.get(message.camera_id)
        if state is None or state.last_time_sec is None or state.frame_size is None:
            return
        clip = self._open_clip(message, state, state.last_time_sec, state.frame_size)
        self._active_clips.append(clip)
        for segment in list(state.closed_segments):
            self._append_segment_to_clip(segment, clip)
        self._finalize_ready_clips()

    def _state(self, camera_id: str) -> _CameraState:
        state = self._states.get(camera_id)
        if state is None:
            segment_dir = self.config.store_dir / "segments" / _safe_name(camera_id)
            segment_dir.mkdir(parents=True, exist_ok=True)
            state = _CameraState(camera_id=camera_id, segment_dir=segment_dir)
            self._states[camera_id] = state
        return state

    def _open_segment(
        self, state: _CameraState, start_time_sec: float, frame_size: tuple[int, int]
    ) -> _OpenSegment:
        segment_stem = f"seg-{_utc_compact()}-{uuid.uuid4().hex[:8]}"
        path, writer, codec = self._open_writer_for_camera(
            state.camera_id, state.segment_dir, segment_stem, frame_size
        )
        return _OpenSegment(
            camera_id=state.camera_id,
            path=path,
            start_time_sec=start_time_sec,
            end_time_sec=start_time_sec,
            started_at=datetime.now(UTC),
            writer=writer,
            codec=codec,
        )

    def _close_segment(self, state: _CameraState) -> _Segment | None:
        current = state.current
        if current is None:
            return None
        current.writer.release()
        state.current = None
        if current.frame_count <= 0:
            _unlink_missing_ok(current.path)
            return None
        segment = _Segment(
            camera_id=current.camera_id,
            path=current.path,
            start_time_sec=current.start_time_sec,
            end_time_sec=current.end_time_sec,
            started_at=current.started_at,
            frame_count=current.frame_count,
        )
        state.closed_segments.append(segment)
        return segment

    def _open_clip(
        self,
        message: _EventMessage,
        state: _CameraState,
        event_time_sec: float,
        frame_size: tuple[int, int],
    ) -> _ActiveClip:
        final_dir = self.config.store_dir / "clips" / message.clip_id
        staging_dir = self.config.store_dir / "clips" / ".staging" / message.clip_id
        staging_dir.mkdir(parents=True, exist_ok=False)
        writer: cv2.VideoWriter | None = None
        tmp_video_path = staging_dir / "clip.tmp.mp4"
        final_video_path: Path | None = staging_dir / "clip.mp4"
        codec: str | None = None
        video_error: str | None = None
        try:
            tmp_video_path, writer, codec = self._open_writer_for_camera(
                message.camera_id, staging_dir, "clip.tmp", frame_size
            )
            final_video_path = staging_dir / f"clip{tmp_video_path.suffix}"
        except Exception as exc:  # noqa: BLE001 - manifest must survive encoder loss
            video_error = str(exc)
            final_video_path = None
        start_time_sec = event_time_sec
        started_at = datetime.now(UTC)
        pre_start = event_time_sec - self.config.pre_event_seconds
        candidates = [
            segment for segment in state.closed_segments if segment.end_time_sec >= pre_start
        ]
        if candidates:
            first = min(candidates, key=lambda segment: segment.start_time_sec)
            start_time_sec = first.start_time_sec
            started_at = first.started_at
        return _ActiveClip(
            camera_id=message.camera_id,
            event_ref=message.event_ref,
            clip_id=message.clip_id,
            event_time_sec=event_time_sec,
            cutoff_time_sec=event_time_sec + self.config.post_event_seconds,
            staging_dir=staging_dir,
            final_dir=final_dir,
            tmp_video_path=tmp_video_path,
            final_video_path=final_video_path,
            manifest_path=staging_dir / "manifest.json",
            writer=writer,
            codec=codec,
            video_error=video_error,
            started_at=started_at,
            start_time_sec=start_time_sec,
            last_time_sec=start_time_sec,
        )

    def _append_segment_to_active_clips(self, segment: _Segment) -> None:
        for clip in list(self._active_clips):
            self._append_segment_to_clip(segment, clip)
        self._finalize_ready_clips()

    def _append_segment_to_clip(self, segment: _Segment, clip: _ActiveClip) -> None:
        if segment.camera_id != clip.camera_id or segment.path in clip.appended_paths:
            return
        window_start = clip.event_time_sec - self.config.pre_event_seconds
        if segment.end_time_sec < window_start or segment.start_time_sec > clip.cutoff_time_sec:
            return
        if clip.writer is not None:
            try:
                frames = _append_video(segment.path, clip.writer)
            except Exception as exc:  # noqa: BLE001 - finalize manifest without video
                clip.writer.release()
                clip.writer = None
                clip.video_error = str(exc)
            else:
                clip.frame_count += frames
        clip.appended_paths.add(segment.path)
        clip.last_time_sec = max(
            clip.last_time_sec, min(segment.end_time_sec, clip.cutoff_time_sec)
        )
        if segment.start_time_sec < clip.start_time_sec:
            clip.start_time_sec = segment.start_time_sec
            clip.started_at = segment.started_at

    def _finalize_ready_clips(self, *, force: bool = False) -> None:
        remaining: list[_ActiveClip] = []
        finalized = False
        for clip in self._active_clips:
            ready = force or clip.last_time_sec >= clip.cutoff_time_sec
            if ready:
                self._finalize_clip(clip)
                finalized = True
            else:
                remaining.append(clip)
        self._active_clips = remaining
        if finalized:
            self._rotate()

    def _finalize_clip(self, clip: _ActiveClip) -> None:
        video_available = clip.writer is not None and clip.frame_count > 0
        video_error = clip.video_error
        if clip.writer is not None:
            clip.writer.release()
        if video_available and clip.final_video_path is not None:
            try:
                os.replace(clip.tmp_video_path, clip.final_video_path)
            except Exception as exc:  # noqa: BLE001 - manifest records video failure
                video_available = False
                video_error = str(exc)
        duration_s = round(max(0.0, clip.last_time_sec - clip.start_time_sec), 3)
        video_path = (
            f"clips/{clip.clip_id}/{clip.final_video_path.name}"
            if video_available and clip.final_video_path is not None
            else None
        )
        manifest = {
            "clip_id": clip.clip_id,
            "camera_id": clip.camera_id,
            "event_ref": clip.event_ref,
            "started_at": _utc_iso(clip.started_at),
            "duration_s": duration_s,
            "codec": clip.codec,
            "path": video_path,
            "finalized": True,
            "video_available": video_available,
        }
        if video_error is not None:
            manifest["video_error"] = video_error
        _atomic_write_json(clip.manifest_path, manifest)
        os.replace(clip.staging_dir, clip.final_dir)
        with self._lock:
            self.stats.finalized_clips += 1
            if not video_available:
                self.stats.video_unavailable_clips += 1

    def _open_writer_for_camera(
        self,
        camera_id: str,
        directory: Path,
        stem: str,
        frame_size: tuple[int, int],
    ) -> tuple[Path, cv2.VideoWriter, str]:
        cached = self._codec_by_camera.get(camera_id)
        candidates = _codec_candidates(self.config.codec)
        if cached is not None:
            candidates = [cached, *(spec for spec in candidates if spec != cached)]
        last_error: Exception | None = None
        for spec in candidates:
            path = directory / f"{stem}{spec.suffix}"
            try:
                writer = _open_writer(path, frame_size, self.config.fps, spec.codec)
            except Exception as exc:  # noqa: BLE001 - try the next encoder
                last_error = exc
                continue
            self._codec_by_camera[camera_id] = spec
            return path, writer, spec.codec
        raise RuntimeError(f"failed to open clip writer for camera {camera_id}: {last_error}")



    def _close_all_open_segments(self) -> None:
        for state in self._states.values():
            closed = self._close_segment(state)
            if closed is not None:
                self._append_segment_to_active_clips(closed)

    def _prune_segment_ring(self, state: _CameraState) -> None:
        if state.last_time_sec is None:
            return
        keep_after = state.last_time_sec - self.config.pre_event_seconds
        kept: list[_Segment] = []
        for segment in state.closed_segments:
            if segment.end_time_sec >= keep_after:
                kept.append(segment)
            else:
                _unlink_missing_ok(segment.path)
        state.closed_segments = kept

    def _rotate(self) -> None:
        clips = _finalized_clips(self.config.store_dir)
        if not clips:
            return
        now = datetime.now(UTC)
        retention_cutoff = now - timedelta(days=self.config.retention_days)
        remaining: list[tuple[datetime, Path]] = []
        for started_at, clip_dir in clips:
            if started_at < retention_cutoff:
                shutil.rmtree(clip_dir, ignore_errors=True)
            else:
                remaining.append((started_at, clip_dir))
        for _started_at, clip_dir in sorted(remaining, key=lambda item: item[0]):
            usage = self._disk_usage_provider(self.config.store_dir)
            if usage.total <= 0 or usage.used / usage.total <= self.config.disk_high_watermark:
                break
            shutil.rmtree(clip_dir, ignore_errors=True)

def _codec_candidates(preferred: str) -> list[_CodecSpec]:
    specs = [_CodecSpec(preferred, ".avi" if preferred == "MJPG" else ".mp4")]
    specs.extend(DEFAULT_CODEC_CANDIDATES)
    unique: list[_CodecSpec] = []
    seen: set[str] = set()
    for spec in specs:
        if spec.codec in seen:
            continue
        seen.add(spec.codec)
        unique.append(spec)
    return unique

class ClipRecorderProtocol(Protocol):
    def on_frame(self, camera_id: str, frame: Frame) -> bool: ...
    def on_event(self, camera_id: str, event_ref: str) -> str | None: ...


def _open_writer(
    path: Path, frame_size: tuple[int, int], fps: float, codec: str
) -> cv2.VideoWriter:
    path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*codec), fps, frame_size)
    if not writer.isOpened():
        writer.release()
        raise RuntimeError(f"failed to open clip writer: {path}")
    return writer


def _append_video(path: Path, writer: cv2.VideoWriter) -> int:
    capture = cv2.VideoCapture(str(path))
    frames = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            writer.write(frame)
            frames += 1
    finally:
        capture.release()
    return frames


def _atomic_write_json(path: Path, payload: dict[str, object]) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"), sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp_path, path)


def _finalized_clips(store_dir: Path) -> list[tuple[datetime, Path]]:
    root = store_dir / "clips"
    if not root.exists():
        return []
    clips: list[tuple[datetime, Path]] = []
    for manifest_path in root.glob("*/manifest.json"):
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if payload.get("finalized") is not True:
            continue
        started_at = _parse_utc(str(payload.get("started_at", "")))
        if started_at is None:
            started_at = datetime.fromtimestamp(manifest_path.stat().st_mtime, UTC)
        clips.append((started_at, manifest_path.parent))
    return clips


def _parse_utc(value: str) -> datetime | None:
    if value == "":
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def _as_bgr(image):  # noqa: ANN001 - numpy dtype is already carried by Frame
    if image.ndim == 3 and image.shape[2] == 3:
        return cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    return image


def _clip_id(camera_id: str) -> str:
    return f"{_safe_name(camera_id)}-{_utc_compact()}-{uuid.uuid4().hex[:12]}"


def _safe_name(value: str) -> str:
    return (
        "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in value)
        or "camera"
    )


def _utc_compact() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")


def _utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _unlink_missing_ok(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return


def _env_str(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return default if value == "" else value


def _env_retention_days() -> int:
    raw = os.environ.get(CLIP_STORE_RETENTION_DAYS_ENV, os.environ.get(CLIP_RETENTION_DAYS_ENV, ""))
    if raw.strip() == "":
        return DEFAULT_RETENTION_DAYS
    return max(1, int(raw))


def _env_disk_high_watermark() -> float:
    raw = os.environ.get(
        CLIP_STORE_MAX_USAGE_ENV,
        os.environ.get(CLIP_DISK_HIGH_WATERMARK_ENV, ""),
    )
    if raw.strip() == "":
        return DEFAULT_DISK_HIGH_WATERMARK
    value = float(raw)
    if value > 1.0:
        value = value / 100.0
    return min(max(value, 0.01), 0.99)


__all__ = [
    "CLIP_STORE_DIR_ENV",
    "ClipRecorder",
    "ClipRecorderConfig",
    "ClipRecorderProtocol",
    "ClipRecorderStats",
]
