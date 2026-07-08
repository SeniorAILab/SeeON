from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request

from worker.mjpeg_server import MjpegServer, OverlayFrameBuffer, dev_mjpeg_enabled, dev_mjpeg_host
from worker.sources.probe import RTSPProbeError


def test_mjpeg_buffer_is_camera_keyed_non_consuming() -> None:
    buffer = OverlayFrameBuffer()
    buffer.register_camera("cam_sp_202")
    buffer.publish_jpeg("cam_sp_201", b"jpeg-1", frame_index=1)
    first = buffer.get_latest("cam_sp_201")
    second = buffer.get_latest("cam_sp_201")
    assert first is not None
    assert second is not None
    assert first.jpeg == b"jpeg-1"
    assert second.jpeg == b"jpeg-1"
    assert buffer.get_latest("cam_sp_202") is None

    buffer.publish_jpeg("cam_sp_201", b"jpeg-2", frame_index=2)
    assert buffer.get_latest("cam_sp_201") is not None
    assert buffer.get_latest("cam_sp_201").jpeg == b"jpeg-2"
    assert buffer.get_latest("cam_sp_202") is None


def test_mjpeg_server_defaults_loopback_and_disabled() -> None:
    assert dev_mjpeg_enabled({}) is False
    assert dev_mjpeg_host({}) == "127.0.0.1"
    buffer = OverlayFrameBuffer()
    server = MjpegServer(buffer, port=0)
    try:
        assert server.host == "127.0.0.1"
    finally:
        server.stop()


def test_mjpeg_server_unknown_empty_and_stream_response() -> None:
    buffer = OverlayFrameBuffer()
    buffer.register_camera("empty")
    buffer.publish_jpeg("cam_sp_201", b"\xff\xd8jpeg\xff\xd9", frame_index=1)
    server = MjpegServer(buffer, port=0)
    server.start()
    base = f"http://127.0.0.1:{server.port}"
    try:
        try:
            urllib.request.urlopen(f"{base}/stream/missing", timeout=1)
        except urllib.error.HTTPError as exc:
            assert exc.code == 404
        else:  # pragma: no cover
            raise AssertionError("unknown camera should 404")
        try:
            urllib.request.urlopen(f"{base}/stream/empty", timeout=1)
        except urllib.error.HTTPError as exc:
            assert exc.code == 503
        else:  # pragma: no cover
            raise AssertionError("empty camera should 503")
        with urllib.request.urlopen(f"{base}/stream/cam_sp_201", timeout=1) as response:
            body = response.read(64)
            assert response.status == 200
            assert b"multipart" in response.headers["Content-Type"].encode()
            assert b"\xff\xd8jpeg" in body
    finally:
        server.stop()


def test_mjpeg_server_probe_requires_token_and_returns_sanitized_result() -> None:
    buffer = OverlayFrameBuffer()
    seen_urls: list[str] = []

    def probe(url: str) -> dict[str, object]:
        seen_urls.append(url)
        return {"ok": True, "width": 640, "height": 360}

    server = MjpegServer(buffer, port=0, probe_token="relay-token", probe=probe)
    server.start()
    base = f"http://127.0.0.1:{server.port}"
    body = json.dumps({"rtsp_url": "rtsp://user:secret@camera.local/trackID=2"}).encode()
    try:
        request = urllib.request.Request(f"{base}/probe", data=body, method="POST")
        try:
            urllib.request.urlopen(request, timeout=1)
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
        else:  # pragma: no cover
            raise AssertionError("probe should require relay token")

        request = urllib.request.Request(
            f"{base}/probe",
            data=body,
            headers={"X-Edge-Relay-Token": "relay-token"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=1) as response:
            payload = json.loads(response.read().decode("utf-8"))

        assert payload == {"height": 360, "ok": True, "width": 640}
        assert seen_urls == ["rtsp://user:secret@camera.local/trackID=2"]
        assert "secret" not in json.dumps(payload)
        assert "camera.local" not in json.dumps(payload)
    finally:
        server.stop()


def test_mjpeg_server_probe_normalizes_auth_failure_without_leaking_url() -> None:
    buffer = OverlayFrameBuffer()

    def probe(url: str) -> dict[str, object]:
        raise RTSPProbeError("auth", f"auth failed for {url}", "rtsp://***:***@camera/track")

    server = MjpegServer(buffer, port=0, probe_token="relay-token", probe=probe)
    server.start()
    base = f"http://127.0.0.1:{server.port}"
    body = json.dumps({"rtsp_url": "rtsp://user:secret@camera.local/trackID=2"}).encode()
    try:
        request = urllib.request.Request(
            f"{base}/probe",
            data=body,
            headers={"X-Edge-Relay-Token": "relay-token"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=1) as response:
            payload = json.loads(response.read().decode("utf-8"))

        assert payload == {"error_class": "auth", "ok": False}
        assert "secret" not in json.dumps(payload)
        assert "camera.local" not in json.dumps(payload)
    finally:
        server.stop()


def test_mjpeg_stream_emits_multiple_camera_keyed_non_consuming_parts() -> None:
    buffer = OverlayFrameBuffer()
    buffer.publish_jpeg("cam_sp_201", b"\xff\xd8cam-201-1\xff\xd9", frame_index=1)
    buffer.publish_jpeg("cam_sp_202", b"\xff\xd8cam-202-1\xff\xd9", frame_index=1)
    server = MjpegServer(buffer, port=0)
    server.start()
    base = f"http://127.0.0.1:{server.port}"

    def publish_updates() -> None:
        time.sleep(0.05)
        buffer.publish_jpeg("cam_sp_202", b"\xff\xd8cam-202-2\xff\xd9", frame_index=2)
        buffer.publish_jpeg("cam_sp_201", b"\xff\xd8cam-201-2\xff\xd9", frame_index=2)
        time.sleep(0.05)
        buffer.publish_jpeg("cam_sp_201", b"\xff\xd8cam-201-3\xff\xd9", frame_index=3)

    publisher = threading.Thread(target=publish_updates)
    try:
        with urllib.request.urlopen(f"{base}/stream/cam_sp_201", timeout=2) as response:
            publisher.start()
            body = bytearray()
            deadline = time.monotonic() + 2.0
            while b"cam-201-3" not in body and time.monotonic() < deadline:
                body.extend(response.read(1))
            assert response.status == 200
            assert body.count(b"Content-Type: image/jpeg") >= 3
            assert body.count(b"--frame\r\n") >= 3
            assert b"cam-201-1" in body
            assert b"cam-201-2" in body
            assert b"cam-201-3" in body
            assert b"cam-202" not in body
    finally:
        publisher.join(timeout=1)
        server.stop()

    latest = buffer.get_latest("cam_sp_201")
    assert latest is not None
    assert latest.jpeg == b"\xff\xd8cam-201-3\xff\xd9"
