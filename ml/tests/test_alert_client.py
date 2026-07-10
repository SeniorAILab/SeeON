from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread

import pytest

from demo.alert_client import AlertClient


class _RecordingHandler(BaseHTTPRequestHandler):
    received: list[dict[str, str | float]] = []
    received_headers: list[dict[str, str | None]] = []
    received_event = Event()

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers["Content-Length"])
        body = self.rfile.read(length)
        payload = json.loads(body.decode("utf-8"))
        self.__class__.received.append(payload)
        self.__class__.received_headers.append(
            {
                "X-" + "Ingest-Key-Id": self.headers.get("X-" + "Ingest-Key-Id"),
                "X-" + "Ingest-Timestamp": self.headers.get("X-" + "Ingest-Timestamp"),
                "X-" + "Signature": self.headers.get("X-" + "Signature"),
                "Content-Type": self.headers.get("Content-Type"),
            }
        )
        self.__class__.received_event.set()
        self.send_response(202)
        self.end_headers()

    def log_message(self, _format: str, *args: object) -> None:
        return


def _run_server(server: ThreadingHTTPServer) -> Thread:
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread


def _wait_for(predicate: object, *, timeout_sec: float = 1.0) -> None:
    deadline = time.perf_counter() + timeout_sec
    while time.perf_counter() < deadline:
        if callable(predicate) and predicate():
            return
        time.sleep(0.005)
    raise AssertionError("timed out waiting for alert client worker")


def _client_kwargs(api_url: str = "http://127.0.0.1:9/events") -> dict[str, str | float]:
    return {"api_url": api_url, "source_id": "demo-video", "camera_id": "demo-cam-01"}


def _reset_handler() -> None:
    _RecordingHandler.received = []
    _RecordingHandler.received_headers = []
    _RecordingHandler.received_event = Event()


def test_alert_client_send_enqueues_and_posts_event_api_payload_without_auth_headers() -> None:
    _reset_handler()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/events"),
        timeout_sec=0.2,
    )
    try:
        accepted = client.send(
            event_type="fall",
            detected_at="2026-06-13T12:00:00.000Z",
            confidence=0.87,
        )

        assert accepted is True
        assert _RecordingHandler.received_event.wait(1.0)
        assert _RecordingHandler.received == [
            {
                "camera_id": "demo-cam-01",
                "type": "fall",
                "detected_at": "2026-06-13T12:00:00.000Z",
                "confidence": 0.87,
            }
        ]
        assert _RecordingHandler.received_headers == [
            {
                "X-" + "Ingest-Key-Id": None,
                "X-" + "Ingest-Timestamp": None,
                "X-" + "Signature": None,
                "Content-Type": "application/json",
            }
        ]
        assert client.failure_count == 0
        assert client.drop_count == 0
    finally:
        client.close()
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_send_accepts_bed_exit_with_event_probability() -> None:
    _reset_handler()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/events"),
        timeout_sec=0.2,
    )
    try:
        accepted = client.send(
            event_type="bed-exit",
            detected_at="2026-06-13T12:00:00.000Z",
            confidence=None,
        )

        assert accepted is True
        assert _RecordingHandler.received_event.wait(1.0)
        assert _RecordingHandler.received[0] == {
            "camera_id": "demo-cam-01",
            "type": "bed-exit",
            "detected_at": "2026-06-13T12:00:00.000Z",
            "confidence": 1.0,
        }
    finally:
        client.close()
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_from_env_builds_event_api_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BACKEND_EVENTS_URL", "http://127.0.0.1:8080/events")
    monkeypatch.setenv("DEMO_CAMERA_ID", "demo-cam-01")

    client = AlertClient.from_env(source_id="demo-video")

    assert client is not None
    assert client.api_url == "http://127.0.0.1:8080/events"
    assert client.source_id == "demo-video"
    assert client.camera_id == "demo-cam-01"
    client.close()


def test_alert_client_from_env_returns_none_without_events_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("API_BACKEND_EVENTS_URL", raising=False)

    assert AlertClient.from_env(source_id="demo-video") is None


def test_alert_client_from_env_rejects_missing_camera_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BACKEND_EVENTS_URL", "http://127.0.0.1:8080/events")
    monkeypatch.delenv("DEMO_CAMERA_ID", raising=False)

    with pytest.raises(ValueError, match="DEMO_CAMERA_ID"):
        AlertClient.from_env(source_id="demo-video")


def test_alert_client_send_is_nonblocking_when_backend_is_down() -> None:
    client = AlertClient(**_client_kwargs(), timeout_sec=0.05)
    try:
        start = time.perf_counter()
        accepted = client.send(
            event_type="fall", detected_at="2026-06-13T12:00:00.000Z", confidence=0.5
        )
        elapsed = time.perf_counter() - start

        assert accepted is True
        assert elapsed < 0.02
        _wait_for(lambda: client.failure_count == 1)
    finally:
        client.close()


def test_alert_client_counts_queue_drops_as_failures() -> None:
    client = AlertClient(**_client_kwargs(), queue_size=1, timeout_sec=0.2, autostart=False)
    try:
        first = client.send(
            event_type="fall", detected_at="2026-06-13T12:00:00.000Z", confidence=0.5
        )
        second = client.send(
            event_type="fall", detected_at="2026-06-13T12:00:01.000Z", confidence=0.6
        )

        assert first is True
        assert second is False
        assert client.drop_count == 1
        assert client.failure_count == 1
        assert client.pending_count == 1
    finally:
        client.close()


def test_alert_client_close_posts_accepted_queued_payload() -> None:
    _reset_handler()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/events"),
        timeout_sec=0.2,
        autostart=False,
    )
    try:
        accepted = client.send(
            event_type="fall",
            detected_at="2026-06-13T12:00:00.000Z",
            confidence=0.87,
        )

        client.close()

        assert accepted is True
        assert _RecordingHandler.received == [
            {
                "camera_id": "demo-cam-01",
                "type": "fall",
                "detected_at": "2026-06-13T12:00:00.000Z",
                "confidence": 0.87,
            }
        ]
        assert client.failure_count == 0
        assert client.drop_count == 0
        assert client.pending_count == 0
    finally:
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_close_counts_accepted_queued_payload_failure() -> None:
    client = AlertClient(**_client_kwargs(), timeout_sec=0.05, autostart=False)

    accepted = client.send(
        event_type="fall", detected_at="2026-06-13T12:00:00.000Z", confidence=0.5
    )

    client.close()

    assert accepted is True
    assert client.failure_count == 1
    assert client.drop_count == 0
    assert client.pending_count == 0


@pytest.mark.parametrize(
    ("kwargs", "expected_failures"),
    [
        ({"detected_at": "", "confidence": 0.5}, 1),
        ({"detected_at": "2026-06-13T12:00:00.000Z", "confidence": None}, 1),
        ({"detected_at": "2026-06-13T12:00:00.000Z", "confidence": 1.1}, 1),
    ],
)
def test_alert_client_rejects_malformed_payload_without_enqueueing(
    kwargs: dict[str, str | float | None], expected_failures: int
) -> None:
    client = AlertClient(**_client_kwargs())
    try:
        accepted = client.send(event_type="fall", **kwargs)

        assert accepted is False
        assert client.failure_count == expected_failures
        assert client.pending_count == 0
    finally:
        client.close()


def test_alert_client_rejects_detection_lost_without_enqueueing() -> None:
    client = AlertClient(**_client_kwargs())
    try:
        accepted = client.send(
            event_type="detection-lost",
            detected_at="2026-06-13T12:00:00.000Z",
            confidence=0.5,
        )

        assert accepted is False
        assert client.failure_count == 1
        assert client.pending_count == 0
    finally:
        client.close()


def test_alert_client_rejects_missing_camera_id() -> None:
    with pytest.raises(ValueError, match="camera_id"):
        AlertClient(**_client_kwargs() | {"camera_id": ""})


def test_alert_client_rejects_invalid_backend_url() -> None:
    with pytest.raises(ValueError, match=r"absolute HTTP\(S\)"):
        AlertClient(**_client_kwargs(api_url="file:///tmp/events"))
