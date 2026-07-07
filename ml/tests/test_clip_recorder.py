from __future__ import annotations

import json
from collections import namedtuple
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from contracts.event import EventPayload
from contracts.frame import Frame
from worker.camera_worker import CameraWorker
from worker.clip_recorder import ClipRecorder, ClipRecorderConfig
from worker.scheduler import Scheduler

DiskUsage = namedtuple("DiskUsage", "total used free")


def _frame(index: int, time_sec: float | None = None) -> Frame:
    value = index % 255
    return Frame(
        index=index,
        time_sec=float(index) if time_sec is None else time_sec,
        image=np.full((16, 16, 3), value, dtype=np.uint8),
    )


def _recorder(tmp_path: Path, **overrides: object) -> ClipRecorder:
    config = ClipRecorderConfig(
        store_dir=tmp_path,
        segment_seconds=float(overrides.pop("segment_seconds", 2.0)),
        pre_event_seconds=float(overrides.pop("pre_event_seconds", 10.0)),
        post_event_seconds=float(overrides.pop("post_event_seconds", 20.0)),
        fps=float(overrides.pop("fps", 2.0)),
        retention_days=int(overrides.pop("retention_days", 30)),
        disk_high_watermark=float(overrides.pop("disk_high_watermark", 0.80)),
        max_queue_size=int(overrides.pop("max_queue_size", 128)),
    )
    assert overrides == {}
    return ClipRecorder(config)


def test_clip_recorder_finalizes_atomic_manifest_with_pre_and_post_window(tmp_path: Path) -> None:
    recorder = _recorder(tmp_path)
    recorder.start()
    try:
        clip_id: str | None = None
        for index in range(69):
            time_sec = index * 0.5
            assert recorder.on_frame("cam-1", _frame(index, time_sec))
            if time_sec == 12.0:
                clip_id = recorder.on_event("cam-1", "evt-1")
                assert clip_id is not None
        assert recorder.flush()
    finally:
        recorder.stop()

    assert clip_id is not None
    manifest_path = tmp_path / "clips" / clip_id / "manifest.json"
    video_path = tmp_path / "clips" / clip_id / "clip.mp4"
    assert manifest_path.exists()
    assert video_path.exists()
    assert not (tmp_path / "clips" / ".staging" / clip_id).exists()
    assert list((tmp_path / "clips" / clip_id).glob("*.tmp")) == []

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest == {
        "camera_id": "cam-1",
        "clip_id": clip_id,
        "codec": manifest["codec"],
        "duration_s": manifest["duration_s"],
        "event_ref": "evt-1",
        "finalized": True,
        "path": f"clips/{clip_id}/{video_path.name}",
        "started_at": manifest["started_at"],
        "video_available": True,
    }
    assert manifest["started_at"].endswith("Z")
    assert 29.0 <= manifest["duration_s"] <= 31.5
    assert recorder.stats.finalized_clips == 1


def test_clip_recorder_falls_back_to_next_codec_once_per_camera(
    tmp_path: Path, monkeypatch
) -> None:
    recorder = _recorder(tmp_path)
    calls: list[str] = []

    class _Writer:
        def isOpened(self) -> bool:
            return True

        def release(self) -> None:
            return None

    def _fake_open_writer(path: Path, _frame_size, _fps: float, codec: str):
        calls.append(codec)
        if codec == "mp4v":
            raise RuntimeError("mp4v unavailable")
        return _Writer()

    monkeypatch.setattr("worker.clip_recorder._open_writer", _fake_open_writer)

    first_path, _first_writer, first_codec = recorder._open_writer_for_camera(
        "cam-1", tmp_path, "clip.tmp", (16, 16)
    )
    second_path, _second_writer, second_codec = recorder._open_writer_for_camera(
        "cam-1", tmp_path, "seg", (16, 16)
    )

    assert first_codec == "MJPG"
    assert first_path.name == "clip.tmp.avi"
    assert second_codec == "MJPG"
    assert second_path.name == "seg.avi"
    # mp4v is tried once, fails, MJPG is cached; the second open reuses MJPG only.
    assert calls == ["mp4v", "MJPG", "MJPG"]


def test_clip_recorder_writes_manifest_when_video_append_fails(
    tmp_path: Path, monkeypatch
) -> None:
    recorder = _recorder(tmp_path, pre_event_seconds=0.0, post_event_seconds=1.0)

    def _fail_append(_path: Path, _writer) -> int:
        raise RuntimeError("decode failed")

    monkeypatch.setattr("worker.clip_recorder._append_video", _fail_append)

    recorder.start()
    try:
        clip_id: str | None = None
        for index in range(8):
            assert recorder.on_frame("cam-1", _frame(index, index * 0.5))
            if index == 2:
                clip_id = recorder.on_event("cam-1", "evt-video-failed", "bed-exit")
                assert clip_id is not None
        assert recorder.flush()
    finally:
        recorder.stop()

    assert clip_id is not None
    manifest_path = tmp_path / "clips" / clip_id / "manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["event_ref"] == "evt-video-failed"
    assert manifest["event_type"] == "bed-exit"
    assert manifest["video_available"] is False
    assert manifest["path"] is None
    assert "decode failed" in manifest["video_error"]
    assert recorder.stats.finalized_clips == 1
    assert recorder.stats.video_unavailable_clips == 1

def test_clip_recorder_writes_manifest_when_no_codec_opens(
    tmp_path: Path, monkeypatch
) -> None:
    # Reproduces the headless-CI/edge condition where no VideoWriter codec
    # initializes: the event must still produce a manifest so the event->clip
    # correlation survives (video_available=false).
    def _no_codec(_path, _frame_size, _fps, _codec):
        raise RuntimeError("no working codec")

    monkeypatch.setattr("worker.clip_recorder._open_writer", _no_codec)
    recorder = _recorder(tmp_path, pre_event_seconds=0.0, post_event_seconds=1.0)
    recorder.start()
    try:
        clip_id: str | None = None
        for index in range(8):
            recorder.on_frame("cam-1", _frame(index, index * 0.5))
            if index == 2:
                clip_id = recorder.on_event("cam-1", "evt-no-codec", "bed-exit")
                assert clip_id is not None
        assert recorder.flush()
    finally:
        recorder.stop()

    assert clip_id is not None
    manifest_path = tmp_path / "clips" / clip_id / "manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["event_ref"] == "evt-no-codec"
    assert manifest["event_type"] == "bed-exit"
    assert manifest["video_available"] is False
    assert manifest["path"] is None


def test_clip_recorder_uses_tmp_then_rename_for_manifest_finalize(
    tmp_path: Path, monkeypatch
) -> None:
    recorder = _recorder(tmp_path, pre_event_seconds=0.0, post_event_seconds=1.0)
    replacements: list[tuple[Path, Path]] = []
    real_replace = __import__("os").replace

    def _record_replace(source: Path, target: Path) -> None:
        replacements.append((Path(source), Path(target)))
        real_replace(source, target)

    monkeypatch.setattr("worker.clip_recorder.os.replace", _record_replace)
    recorder.start()
    try:
        for index in range(8):
            assert recorder.on_frame("cam-1", _frame(index, index * 0.5))
            if index == 2:
                recorder.on_event("cam-1", "evt-atomic")
        assert recorder.flush()
    finally:
        recorder.stop()

    assert any(
        source.name == "manifest.json.tmp" and target.name == "manifest.json"
        for source, target in replacements
    )


def test_clip_recorder_rotation_deletes_retention_and_oldest_over_disk_limit(
    tmp_path: Path,
) -> None:
    old_dir = _finalized_clip_dir(tmp_path, "old", datetime.now(UTC) - timedelta(days=31))
    newer_dir = _finalized_clip_dir(tmp_path, "newer", datetime.now(UTC) - timedelta(days=1))
    newest_dir = _finalized_clip_dir(tmp_path, "newest", datetime.now(UTC))
    usages = iter([DiskUsage(total=100, used=90, free=10), DiskUsage(total=100, used=70, free=30)])
    recorder = ClipRecorder(
        ClipRecorderConfig(store_dir=tmp_path, retention_days=30, disk_high_watermark=0.80),
        disk_usage_provider=lambda _path: next(usages),
    )
    recorder.start()
    try:
        assert recorder.rotate_once()
    finally:
        recorder.stop()

    assert not old_dir.exists()
    assert not newer_dir.exists()
    assert newest_dir.exists()


def test_clip_recorder_queue_full_drops_without_blocking(tmp_path: Path) -> None:
    recorder = _recorder(tmp_path, max_queue_size=1)

    assert recorder.on_frame("cam-1", _frame(0))
    assert not recorder.on_frame("cam-1", _frame(1))
    assert recorder.dropped_frame_count == 1


@dataclass(slots=True)
class _Sink:
    events: list[EventPayload] = field(default_factory=list)

    def emit(self, event: EventPayload) -> None:
        self.events.append(event)


@dataclass(slots=True)
class _RecorderSpy:
    frames: list[tuple[str, int]] = field(default_factory=list)
    events: list[tuple[str, str]] = field(default_factory=list)
    event_types: list[str | None] = field(default_factory=list)

    def on_frame(self, camera_id: str, frame: Frame) -> bool:
        self.frames.append((camera_id, frame.index))
        return True

    def on_event(self, camera_id: str, event_ref: str, event_type: str | None = None) -> str:
        self.events.append((camera_id, event_ref))
        self.event_types.append(event_type)
        return "clip-id"


class _Detector:
    def update(self, _observation, time_sec: float | None = None) -> EventPayload:
        return {"event_type": "other", "event_id": f"evt-{time_sec}"}


def test_camera_worker_records_frames_and_admitted_events_without_blocking() -> None:
    sink = _Sink()
    recorder = _RecorderSpy()
    worker = CameraWorker(
        camera_id="cam-1",
        facility_id="facility-1",
        frame_source=(),
        runners={},
        scheduler=Scheduler({}),
        domain_detectors=(_Detector(),),
        event_sink=sink,
        clip_recorder=recorder,
    )

    worker.process_frame(_frame(7, 7.0))

    assert recorder.frames == [("cam-1", 7)]
    assert recorder.events == [("cam-1", "evt-7.0")]
    assert recorder.event_types == ["other"]
    assert sink.events[0]["camera_id"] == "cam-1"


def _finalized_clip_dir(root: Path, clip_id: str, started_at: datetime) -> Path:
    clip_dir = root / "clips" / clip_id
    clip_dir.mkdir(parents=True)
    (clip_dir / "clip.mp4").write_bytes(b"video")
    (clip_dir / "manifest.json").write_text(
        json.dumps(
            {
                "clip_id": clip_id,
                "camera_id": "cam-1",
                "event_ref": f"evt-{clip_id}",
                "started_at": started_at.isoformat().replace("+00:00", "Z"),
                "duration_s": 30.0,
                "codec": "mp4v",
                "path": f"clips/{clip_id}/clip.mp4",
                "finalized": True,
                "video_available": True,
            }
        ),
        encoding="utf-8",
    )
    return clip_dir
