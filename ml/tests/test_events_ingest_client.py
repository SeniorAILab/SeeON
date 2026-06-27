from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from contracts.event import MutableEventPayload
from events.edge_ingest_client import EdgeIngestClient


class _RecordingHandler(BaseHTTPRequestHandler):
    received: list[tuple[str, dict[str, str | None], MutableEventPayload]] = []

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        payload = json.loads(body.decode("utf-8"))
        self.__class__.received.append(
            (
                self.path,
                {
                    "Content-Type": self.headers.get("Content-Type"),
                    "X-" + "Ingest-Key-Id": self.headers.get("X-" + "Ingest-Key-Id"),
                    "X-" + "Ingest-Timestamp": self.headers.get("X-" + "Ingest-Timestamp"),
                    "X-" + "Signature": self.headers.get("X-" + "Signature"),
                },
                payload,
            )
        )
        self.send_response(201)
        self.end_headers()

    def log_message(self, _format: str, *args: str) -> None:
        return


def test_edge_ingest_client_posts_event_api_alert_and_heartbeat_without_auth_headers() -> None:
    _RecordingHandler.received = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = EdgeIngestClient(
        events_url=f"http://127.0.0.1:{server.server_port}/events",
        camera_id="camera-1",
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

        assert _RecordingHandler.received == [
            (
                "/events/heartbeat",
                {
                    "Content-Type": "application/json",
                    "X-" + "Ingest-Key-Id": None,
                    "X-" + "Ingest-Timestamp": None,
                    "X-" + "Signature": None,
                },
                {"camera_id": "camera-1"},
            ),
            (
                "/events",
                {
                    "Content-Type": "application/json",
                    "X-" + "Ingest-Key-Id": None,
                    "X-" + "Ingest-Timestamp": None,
                    "X-" + "Signature": None,
                },
                {
                    "camera_id": "camera-1",
                    "type": "fall",
                    "detected_at": "2026-06-23T12:00:00.000Z",
                    "confidence": 0.91,
                },
            ),
        ]
        assert client.failure_count == 0
    finally:
        server.shutdown()
        thread.join(timeout=1.0)


def test_edge_ingest_client_counts_backend_failure() -> None:
    class _RejectingHandler(_RecordingHandler):
        def do_POST(self) -> None:  # noqa: N802
            self.send_response(500)
            self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), _RejectingHandler)
    thread = _run_server(server)
    client = EdgeIngestClient(
        events_url=f"http://127.0.0.1:{server.server_port}/events",
        camera_id="camera-1",
        timeout_sec=0.2,
    )
    try:
        assert client.send_heartbeat() is False
        assert client.failure_count == 1
    finally:
        server.shutdown()
        thread.join(timeout=1.0)


def test_edge_ingest_client_does_not_emit_detection_lost() -> None:
    _RecordingHandler.received = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    thread = _run_server(server)
    client = EdgeIngestClient(
        events_url=f"http://127.0.0.1:{server.server_port}/events",
        camera_id="camera-1",
        timeout_sec=0.2,
    )
    try:
        client.emit(
            {
                "event_type": "detection-lost",
                "detected_at": "2026-06-23T12:00:00.000Z",
                "probability": 0.91,
            }
        )

        assert _RecordingHandler.received == []
        assert client.failure_count == 0
    finally:
        server.shutdown()
        thread.join(timeout=1.0)


def _run_server(server: ThreadingHTTPServer) -> Thread:
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread
