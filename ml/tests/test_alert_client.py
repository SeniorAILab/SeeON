from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread

import pytest

from demo.alert_client import AlertClient


class _RecordingHandler(BaseHTTPRequestHandler):
    received: list[dict[str, str | float]] = []
    received_api_keys: list[str | None] = []
    received_event = Event()

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers["Content-Length"])
        body = self.rfile.read(length)
        payload = json.loads(body.decode("utf-8"))
        self.__class__.received.append(payload)
        self.__class__.received_api_keys.append(self.headers.get("x-alert-api-key"))
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


def test_alert_client_send_enqueues_and_posts_payload() -> None:
    _RecordingHandler.received = []
    _RecordingHandler.received_api_keys = []
    _RecordingHandler.received_event = Event()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        api_url=f"http://127.0.0.1:{server.server_port}/api.alerts/events",
        source_id="demo-video",
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
        assert len(_RecordingHandler.received) == 1
        posted = _RecordingHandler.received[0]
        assert posted == {
            "type": "fall",
            "source_id": "demo-video",
            "external_event_id": posted["external_event_id"],
            "detected_at": "2026-06-13T12:00:00.000Z",
            "confidence": 0.87,
        }
        assert isinstance(posted["external_event_id"], str)
        assert posted["external_event_id"] != ""
        assert client.failure_count == 0
        assert client.drop_count == 0
    finally:
        client.close()
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_posts_configured_alert_api_key_header() -> None:
    _RecordingHandler.received = []
    _RecordingHandler.received_api_keys = []
    _RecordingHandler.received_event = Event()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        api_url=f"http://127.0.0.1:{server.server_port}/api.alerts/events",
        source_id="demo-video",
        timeout_sec=0.2,
        api_key="test-alert-events-api-key",
    )
    try:
        accepted = client.send(
            event_type="fall",
            detected_at="2026-06-13T12:00:00.000Z",
            confidence=0.87,
        )

        assert accepted is True
        assert _RecordingHandler.received_event.wait(1.0)
        assert len(_RecordingHandler.received) == 1
        assert isinstance(_RecordingHandler.received[0]["external_event_id"], str)
        assert _RecordingHandler.received[0]["external_event_id"] != ""
        assert _RecordingHandler.received_api_keys == ["test-alert-events-api-key"]
    finally:
        client.close()
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_send_is_nonblocking_when_backend_is_down() -> None:
    client = AlertClient(
        api_url="http://127.0.0.1:9/api.alerts/events",
        source_id="demo-video",
        timeout_sec=0.05,
    )
    try:
        start = time.perf_counter()
        accepted = client.send(event_type="fall", detected_at="2026-06-13T12:00:00.000Z")
        elapsed = time.perf_counter() - start

        assert accepted is True
        assert elapsed < 0.02
        _wait_for(lambda: client.failure_count == 1)
    finally:
        client.close()


def test_alert_client_counts_queue_drops_as_failures() -> None:
    client = AlertClient(
        api_url="http://127.0.0.1:9/api.alerts/events",
        source_id="demo-video",
        queue_size=1,
        timeout_sec=0.2,
        autostart=False,
    )
    try:
        first = client.send(event_type="fall", detected_at="2026-06-13T12:00:00.000Z")
        second = client.send(event_type="fall", detected_at="2026-06-13T12:00:01.000Z")

        assert first is True
        assert second is False
        assert client.drop_count == 1
        assert client.failure_count == 1
        assert client.pending_count == 1
    finally:
        client.close()


def test_alert_client_close_posts_accepted_queued_payload() -> None:
    _RecordingHandler.received = []
    _RecordingHandler.received_api_keys = []
    _RecordingHandler.received_event = Event()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        api_url=f"http://127.0.0.1:{server.server_port}/api.alerts/events",
        source_id="demo-video",
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
        assert len(_RecordingHandler.received) == 1
        posted = _RecordingHandler.received[0]
        assert posted == {
            "type": "fall",
            "source_id": "demo-video",
            "external_event_id": posted["external_event_id"],
            "detected_at": "2026-06-13T12:00:00.000Z",
            "confidence": 0.87,
        }
        assert client.failure_count == 0
        assert client.drop_count == 0
        assert client.pending_count == 0
    finally:
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_close_counts_accepted_queued_payload_failure() -> None:
    client = AlertClient(
        api_url="http://127.0.0.1:9/api.alerts/events",
        source_id="demo-video",
        timeout_sec=0.05,
        autostart=False,
    )

    accepted = client.send(event_type="fall", detected_at="2026-06-13T12:00:00.000Z")

    client.close()

    assert accepted is True
    assert client.failure_count == 1
    assert client.drop_count == 0
    assert client.pending_count == 0


def test_alert_client_rejects_malformed_payload_without_enqueueing() -> None:
    client = AlertClient(api_url="http://127.0.0.1:9/api.alerts/events", source_id="demo-video")
    try:
        accepted = client.send(event_type="fall", detected_at="not-an-iso-timestamp")

        assert accepted is False
        assert client.failure_count == 1
        assert client.pending_count == 0
    finally:
        client.close()


def test_alert_client_rejects_unknown_event_type_without_enqueueing() -> None:
    client = AlertClient(api_url="http://127.0.0.1:9/api.alerts/events", source_id="demo-video")
    try:
        accepted = client.send(event_type="fire", detected_at="2026-06-13T12:00:00.000Z")

        assert accepted is False
        assert client.failure_count == 1
        assert client.pending_count == 0
    finally:
        client.close()


def test_alert_client_rejects_invalid_backend_url() -> None:
    with pytest.raises(ValueError, match="absolute HTTP\\(S\\)"):
        AlertClient(api_url="file:///tmp/api.alerts/events", source_id="demo-video")
