from __future__ import annotations

import json
import logging
import os
import subprocess
from typing import IO, Protocol, runtime_checkable

import cv2
import numpy as np
from numpy.typing import NDArray

LOGGER = logging.getLogger(__name__)


@runtime_checkable
class RTSPCapture(Protocol):
    def read(self) -> tuple[bool, NDArray[np.uint8] | None]: ...

    def release(self) -> None: ...

    def set(self, prop_id: int, value: float) -> bool: ...


@runtime_checkable
class RTSPBackend(Protocol):
    """Decode RTSP streams into RGB uint8 frames."""
    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture: ...

    # Returns (ok, frame) where frame is RGB NDArray[np.uint8] when ok is True.
    def read(self, capture: RTSPCapture) -> tuple[bool, NDArray[np.uint8] | None]: ...

    def release(self, capture: RTSPCapture) -> None: ...


class OpenCVRTSPBackend:
    """Software (CPU) RTSP decode via OpenCV's FFmpeg backend."""

    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture:
        _ensure_rtsp_over_tcp()
        params = [
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
            open_timeout_ms,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC,
            read_timeout_ms,
        ]
        try:
            capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG, params)
        except (TypeError, cv2.error):
            try:
                capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            except TypeError:
                capture = cv2.VideoCapture(url)
        set_capture_property(capture, "CAP_PROP_BUFFERSIZE", 1)
        set_capture_property(capture, "CAP_PROP_READ_TIMEOUT_MSEC", read_timeout_ms)
        return capture

    def read(self, capture: RTSPCapture) -> tuple[bool, NDArray[np.uint8] | None]:
        read_ok, frame_bgr = capture.read()
        if not read_ok or frame_bgr is None:
            return read_ok, None
        return True, cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    def release(self, capture: RTSPCapture) -> None:
        capture.release()


# ─── NVDEC (GPU hardware) backend ─────────────────────────────────────────────
# H.265/H.264 NVR streams are decoded on the NVIDIA GPU's dedicated NVDEC engine
# via an FFmpeg subprocess (`-hwaccel cuda -c:v <codec>_cuvid`). This offloads
# software decode from the CPU and — unlike the CPU path — reliably reconstructs
# reference frames at full frame rate (no "Could not find ref with POC" flood),
# so the live wall can run smoothly. Frames are emitted as rgb24 for the
# CPU-side detection pipeline (the win is the decode, not zero-copy).

_FFMPEG_BIN_ENV = "ML_FFMPEG_BIN"
_DEFAULT_FFMPEG_BIN = "ffmpeg"
_CUVID_DECODER_BY_CODEC = {
    "hevc": "hevc_cuvid",
    "h265": "hevc_cuvid",
    "h264": "h264_cuvid",
    "avc": "h264_cuvid",
    "av1": "av1_cuvid",
    "vp9": "vp9_cuvid",
    "vp8": "vp8_cuvid",
    "mjpeg": "mjpeg_cuvid",
}


class NvdecUnavailableError(RuntimeError):
    """Raised when an NVDEC capture cannot be established (probe/spawn failure)."""


def _ffmpeg_bin() -> str:
    return os.environ.get(_FFMPEG_BIN_ENV, _DEFAULT_FFMPEG_BIN).strip() or _DEFAULT_FFMPEG_BIN


def _ffprobe_bin() -> str:
    binary = _ffmpeg_bin()
    if binary.endswith("ffmpeg"):
        return f"{binary[: -len('ffmpeg')]}ffprobe"
    return "ffprobe"


def _probe_stream_metadata(url: str, timeout_sec: float) -> tuple[int, int, str]:
    """Return (width, height, codec_name) for the first video stream via ffprobe."""
    cmd = [
        _ffprobe_bin(),
        "-v",
        "error",
        "-rtsp_transport",
        "tcp",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,codec_name",
        "-of",
        "json",
        url,
    ]
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=max(1.0, timeout_sec),
            check=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise NvdecUnavailableError(f"ffprobe failed: {exc}") from exc
    try:
        streams = json.loads(completed.stdout).get("streams", [])
        stream = streams[0]
        return int(stream["width"]), int(stream["height"]), str(stream["codec_name"])
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise NvdecUnavailableError(f"ffprobe metadata unusable: {exc}") from exc


class _NvdecCapture:
    """RTSPCapture backed by an FFmpeg NVDEC decode subprocess (rgb24 stdout)."""

    def __init__(self, proc: subprocess.Popen[bytes], width: int, height: int) -> None:
        self._proc: subprocess.Popen[bytes] | None = proc
        self.width = width
        self.height = height
        self._frame_size = width * height * 3

    def read(self) -> tuple[bool, NDArray[np.uint8] | None]:
        proc = self._proc
        if proc is None or proc.stdout is None:
            return False, None
        buffer = self._read_exact(proc.stdout, self._frame_size)
        if buffer is None:
            return False, None
        frame = np.frombuffer(buffer, dtype=np.uint8).reshape(self.height, self.width, 3)
        return True, frame.copy()  # copy: frombuffer is read-only; overlays draw in place

    @staticmethod
    def _read_exact(stream: IO[bytes], size: int) -> bytes | None:
        chunks: list[bytes] = []
        remaining = size
        while remaining > 0:
            chunk = stream.read(remaining)
            if not chunk:
                return None
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def set(self, prop_id: int, value: float) -> bool:  # noqa: ARG002 - protocol parity
        return False

    def release(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        if proc.stdout is not None:
            try:
                proc.stdout.close()
            except OSError:
                pass
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass


class NvdecRTSPBackend:
    """GPU (NVIDIA NVDEC) RTSP decode via an FFmpeg cuvid subprocess."""

    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture:
        width, height, codec = _probe_stream_metadata(url, max(1, open_timeout_ms) / 1000.0)
        args = [
            _ffmpeg_bin(),
            "-nostdin",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-hwaccel",
            "cuda",
        ]
        decoder = _CUVID_DECODER_BY_CODEC.get(codec.strip().lower())
        if decoder is not None:
            args += ["-c:v", decoder]
        args += ["-i", url, "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
        try:
            proc = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
        except OSError as exc:
            raise NvdecUnavailableError(f"failed to start ffmpeg NVDEC decoder: {exc}") from exc
        return _NvdecCapture(proc, width, height)

    def read(self, capture: RTSPCapture) -> tuple[bool, NDArray[np.uint8] | None]:
        return capture.read()

    def release(self, capture: RTSPCapture) -> None:
        capture.release()


# ─── Fallback (auto) backend ──────────────────────────────────────────────────


class _FallbackCapture:
    """Wraps the chosen backend's capture; replays the validating first frame."""

    def __init__(
        self,
        backend: RTSPBackend,
        capture: RTSPCapture,
        *,
        pending: NDArray[np.uint8] | None,
    ) -> None:
        self._backend = backend
        self._capture = capture
        self._pending = pending

    def read(self) -> tuple[bool, NDArray[np.uint8] | None]:
        if self._pending is not None:
            frame = self._pending
            self._pending = None
            return True, frame
        return self._backend.read(self._capture)

    def set(self, prop_id: int, value: float) -> bool:  # noqa: ARG002 - protocol parity
        return False

    def release(self) -> None:
        self._backend.release(self._capture)


class FallbackRTSPBackend:
    """Try preferred backends in order, fall back to the last (safe) backend.

    Each preferred backend is validated with a single probe read on open; the
    first that yields a frame is used (and that frame is replayed so none is
    lost). The final backend is treated as the always-available safe path
    (OpenCV/CPU) and is opened without validation so its own reconnect loop
    governs recovery. This keeps the fallback *policy* separate from the
    decode strategies.
    """

    def __init__(self, backends: list[tuple[str, RTSPBackend]]) -> None:
        if not backends:
            raise ValueError("FallbackRTSPBackend requires at least one backend")
        self._backends = backends

    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture:
        *preferred, safe = self._backends
        for name, backend in preferred:
            try:
                capture = backend.open(url, open_timeout_ms, read_timeout_ms)
            except Exception as exc:  # noqa: BLE001 - any failure -> fall back
                LOGGER.warning("decode backend %s unavailable: %s", name, exc)
                continue
            try:
                ok, frame = backend.read(capture)
            except Exception as exc:  # noqa: BLE001 - any failure -> fall back
                LOGGER.warning("decode backend %s read failed: %s", name, exc)
                backend.release(capture)
                continue
            if ok and frame is not None:
                LOGGER.info("decode backend active: %s", name)
                return _FallbackCapture(backend, capture, pending=frame)
            LOGGER.warning("decode backend %s produced no frame; falling back", name)
            backend.release(capture)
        safe_name, safe_backend = safe
        LOGGER.info("decode backend active: %s (fallback)", safe_name)
        capture = safe_backend.open(url, open_timeout_ms, read_timeout_ms)
        return _FallbackCapture(safe_backend, capture, pending=None)

    def read(self, capture: RTSPCapture) -> tuple[bool, NDArray[np.uint8] | None]:
        return capture.read()

    def release(self, capture: RTSPCapture) -> None:
        capture.release()


def set_capture_property(capture: RTSPCapture, name: str, value: int) -> None:
    prop = getattr(cv2, name, None)
    if prop is not None:
        capture.set(prop, value)


_RTSP_OVER_TCP_OPTION = "rtsp_transport;tcp"


def _ensure_rtsp_over_tcp() -> None:
    """Default OpenCV's FFmpeg RTSP transport to TCP.

    Live H.265 (HEVC) NVR substreams over the default UDP transport drop
    packets, corrupting reference frames and flooding the decoder with
    "First slice in a frame missing" / "Could not find ref with POC" /
    "Error constructing the frame RPS" errors that degrade detection. TCP
    trades a little latency for a lossless stream. Operators can override
    the whole option string via OPENCV_FFMPEG_CAPTURE_OPTIONS.
    """
    if not os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS"):
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = _RTSP_OVER_TCP_OPTION


__all__ = [
    "FallbackRTSPBackend",
    "NvdecRTSPBackend",
    "NvdecUnavailableError",
    "OpenCVRTSPBackend",
    "RTSPBackend",
    "RTSPCapture",
    "set_capture_property",
]
