from __future__ import annotations

import hashlib
import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from events.edge_ingest_client import EdgeIngestClient


class _VerifyingHandler(BaseHTTPRequestHandler):
    received: list[tuple[str, dict[str, str | None], dict[str, object]]] = []
    secrets_by_key: dict[str, str] = {}

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        payload = {} if body == b"" else json.loads(body.decode("utf-8"))
        key_id = self.headers.get("X-Ingest-Key-Id")
        timestamp = self.headers.get("X-Ingest-Timestamp")
        signature = self.headers.get("X-Signature")
        expected = _expected_signature(
            payload=payload,
            secret=self.secrets_by_key.get("" if key_id is None else key_id, ""),
        )
        status = 202 if timestamp is not None and signature == expected else 401
        self.__class__.received.append(
            (
                self.path,
                {
                    "X-Ingest-Key-Id": key_id,
                    "X-Ingest-Timestamp": timestamp,
                    "X-Signature": signature,
                },
                payload,
            )
        )
        self.send_response(status)
        self.end_headers()

    def log_message(self, _format: str, *args: object) -> None:
        return


def test_edge_ingest_client_posts_heartbeat_and_alert_with_per_camera_key() -> None:
    _VerifyingHandler.received = []
    _VerifyingHandler.secrets_by_key = {"key-1": "secret-1"}
    server = ThreadingHTTPServer(("127.0.0.1", 0), _VerifyingHandler)
    thread = _run_server(server)
    client = EdgeIngestClient(
        alert_url=f"http://127.0.0.1:{server.server_port}/ingest/alerts",
        heartbeat_url=f"http://127.0.0.1:{server.server_port}/ingest/heartbeat",
        camera_id="camera-1",
        facility_id="facility-1",
        resident_id="resident-1",
        ingest_key_id="key-1",
        ingest_secret="secret-1",
        timeout_sec=0.2,
    )
    try:
        assert client.send_heartbeat() is True
        assert (
            client.send_alert(
                event_type="fall",
                detected_at="2026-06-23T12:00:00.000Z",
                probability=0.91,
            )
            is True
        )

        assert [item[0] for item in _VerifyingHandler.received] == [
            "/ingest/heartbeat",
            "/ingest/alerts",
        ]
        assert [item[1]["X-Ingest-Key-Id"] for item in _VerifyingHandler.received] == [
            "key-1",
            "key-1",
        ]
        assert _VerifyingHandler.received[1][2]["resident_id"] == "resident-1"
        assert client.failure_count == 0
    finally:
        server.shutdown()
        thread.join(timeout=1.0)


def test_swapped_camera_secret_is_rejected() -> None:
    _VerifyingHandler.received = []
    _VerifyingHandler.secrets_by_key = {"key-1": "secret-1"}
    server = ThreadingHTTPServer(("127.0.0.1", 0), _VerifyingHandler)
    thread = _run_server(server)
    client = EdgeIngestClient(
        alert_url=f"http://127.0.0.1:{server.server_port}/ingest/alerts",
        heartbeat_url=f"http://127.0.0.1:{server.server_port}/ingest/heartbeat",
        camera_id="camera-1",
        facility_id="facility-1",
        resident_id="resident-1",
        ingest_key_id="key-1",
        ingest_secret="secret-from-another-camera",
        timeout_sec=0.2,
    )
    try:
        assert client.send_heartbeat() is False
        assert client.failure_count == 1
    finally:
        server.shutdown()
        thread.join(timeout=1.0)


def _run_server(server: ThreadingHTTPServer) -> Thread:
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread


def _expected_signature(*, payload: dict[str, object], secret: str) -> str:
    signing_key = hashlib.sha256(secret.encode("utf-8")).hexdigest()
    canonical = "|".join(
        str(payload.get(field, ""))
        for field in ("resident_id", "facility_id", "type", "detected_at")
    )
    return hmac.new(
        signing_key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()
