from __future__ import annotations

import hashlib
import hmac
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread

import pytest

from core.alert_client import AlertClient


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
                "X-Ingest-Key-Id": self.headers.get("X-Ingest-Key-Id"),
                "X-Ingest-Timestamp": self.headers.get("X-Ingest-Timestamp"),
                "X-Signature": self.headers.get("X-Signature"),
                "x-alert-api-key": self.headers.get("x-alert-api-key"),
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


def _client_kwargs(api_url: str = "http://127.0.0.1:9/ingest/alerts") -> dict[str, str | float]:
    return {
        "api_url": api_url,
        "source_id": "demo-video",
        "ingest_key_id": "demo-cam-01",
        "ingest_secret": "raw-demo-secret",
        "resident_id": "resident-001",
        "facility_id": "facility-001",
    }


def _expected_signature(
    *,
    secret: str,
    resident_id: str,
    facility_id: str,
    detected_at: str,
    event_type: str = "fall",
) -> str:
    signing_key = hashlib.sha256(secret.encode("utf-8")).hexdigest()
    canonical = f"{resident_id}|{facility_id}|{event_type}|{detected_at}"
    return hmac.new(
        signing_key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _reset_handler() -> None:
    _RecordingHandler.received = []
    _RecordingHandler.received_headers = []
    _RecordingHandler.received_event = Event()


def test_alert_client_send_enqueues_and_posts_hmac_ingest_payload() -> None:
    _reset_handler()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/ingest/alerts"),
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
        assert _RecordingHandler.received[0] == {
            "resident_id": "resident-001",
            "facility_id": "facility-001",
            "probability": 0.87,
            "detected_at": "2026-06-13T12:00:00.000Z",
            "type": "fall",
        }
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
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/ingest/alerts"),
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
            "resident_id": "resident-001",
            "facility_id": "facility-001",
            "probability": 1.0,
            "detected_at": "2026-06-13T12:00:00.000Z",
            "type": "bed-exit",
        }
    finally:
        client.close()
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_posts_hmac_headers_and_signature() -> None:
    _reset_handler()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/ingest/alerts"),
        timeout_sec=0.2,
    )
    try:
        detected_at = "2026-06-13T12:00:00.000Z"
        accepted = client.send(event_type="fall", detected_at=detected_at, confidence=0.87)

        assert accepted is True
        assert _RecordingHandler.received_event.wait(1.0)
        assert len(_RecordingHandler.received_headers) == 1
        headers = _RecordingHandler.received_headers[0]
        assert headers["X-Ingest-Key-Id"] == "demo-cam-01"
        assert headers["X-Ingest-Timestamp"] is not None
        assert headers["X-Signature"] == _expected_signature(
            secret="raw-demo-secret",
            resident_id="resident-001",
            facility_id="facility-001",
            detected_at=detected_at,
            event_type="fall",
        )
        assert headers["Content-Type"] == "application/json"
        assert headers["x-alert-api-key"] is None
    finally:
        client.close()
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_posts_bed_exit_signature_with_type_in_canonical() -> None:
    _reset_handler()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = AlertClient(
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/ingest/alerts"),
        timeout_sec=0.2,
    )
    try:
        detected_at = "2026-06-13T12:00:00.000Z"
        accepted = client.send(event_type="bed-exit", detected_at=detected_at)

        assert accepted is True
        assert _RecordingHandler.received_event.wait(1.0)
        headers = _RecordingHandler.received_headers[0]
        assert headers["X-Signature"] == _expected_signature(
            secret="raw-demo-secret",
            resident_id="resident-001",
            facility_id="facility-001",
            detected_at=detected_at,
            event_type="bed-exit",
        )
    finally:
        client.close()
        server.shutdown()
        thread.join(timeout=1.0)


def test_alert_client_from_env_builds_hmac_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALERT_API_URL", "http://127.0.0.1:8080/ingest/alerts")
    monkeypatch.setenv("INGEST_KEY_ID", "demo-cam-01")
    monkeypatch.setenv("INGEST_SECRET", "raw-demo-secret")
    monkeypatch.setenv("DEMO_RESIDENT_ID", "resident-001")
    monkeypatch.setenv("DEMO_FACILITY_ID", "facility-001")

    client = AlertClient.from_env(source_id="demo-video")

    assert client is not None
    assert client.api_url == "http://127.0.0.1:8080/ingest/alerts"
    assert client.source_id == "demo-video"
    assert client.ingest_key_id == "demo-cam-01"
    assert client.resident_id == "resident-001"
    assert client.facility_id == "facility-001"
    client.close()


def test_alert_client_from_env_returns_none_without_alert_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ALERT_API_URL", raising=False)

    assert AlertClient.from_env(source_id="demo-video") is None


def test_alert_client_from_env_rejects_incomplete_hmac_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALERT_API_URL", "http://127.0.0.1:8080/ingest/alerts")
    monkeypatch.setenv("INGEST_KEY_ID", "demo-cam-01")
    monkeypatch.delenv("INGEST_SECRET", raising=False)
    monkeypatch.setenv("DEMO_RESIDENT_ID", "resident-001")
    monkeypatch.setenv("DEMO_FACILITY_ID", "facility-001")

    with pytest.raises(ValueError, match="INGEST_SECRET"):
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
        **_client_kwargs(api_url=f"http://127.0.0.1:{server.server_port}/ingest/alerts"),
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
        assert _RecordingHandler.received[0] == {
            "resident_id": "resident-001",
            "facility_id": "facility-001",
            "probability": 0.87,
            "detected_at": "2026-06-13T12:00:00.000Z",
            "type": "fall",
        }
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
        ({"detected_at": "not-an-iso-timestamp", "confidence": 0.5}, 1),
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


def test_alert_client_rejects_unknown_event_type_without_enqueueing() -> None:
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


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("ingest_key_id", ""),
        ("ingest_secret", ""),
        ("resident_id", ""),
        ("facility_id", ""),
    ],
)
def test_alert_client_rejects_missing_required_ingest_fields(field: str, value: str) -> None:
    kwargs = _client_kwargs()
    kwargs[field] = value

    with pytest.raises(ValueError, match=field):
        AlertClient(**kwargs)


def test_alert_client_rejects_invalid_backend_url() -> None:
    with pytest.raises(ValueError, match=r"absolute HTTP\(S\)"):
        AlertClient(**_client_kwargs(api_url="file:///tmp/ingest/alerts"))
