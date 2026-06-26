from __future__ import annotations

import json
import urllib.request
from typing import Self

import pytest
from edge_worker_fixtures import edge_config_payload
from pydantic import ValidationError

from events.edge_ingest_client import EdgeIngestClient
from worker.edge_worker_config import EdgeWorkerConfig


def test_edge_worker_config_uses_local_relay_and_has_no_backend_ingest_urls() -> None:
    config = EdgeWorkerConfig.model_validate(edge_config_payload(camera_count=1))

    assert config.relay.url == "http://127.0.0.1:8000"
    assert config.relay_alert_url == "http://127.0.0.1:8000/relay/alerts"
    assert config.relay_heartbeat_url == "http://127.0.0.1:8000/relay/heartbeat"
    assert not hasattr(config, "alert_api_url")
    assert not hasattr(config, "heartbeat_api_url")


@pytest.mark.parametrize("field_name", ["ingest", "alert_api_url", "heartbeat_api_url"])
def test_edge_worker_config_rejects_backend_ingest_fields(field_name: str) -> None:
    payload = edge_config_payload(camera_count=1)
    payload[field_name] = (
        {"alert_api_url": "http://backend.local/ingest/alerts"}
        if field_name == "ingest"
        else "http://backend.local/ingest/alerts"
    )

    with pytest.raises(ValidationError, match=field_name):
        EdgeWorkerConfig.model_validate(payload)


@pytest.mark.parametrize("field_name", ["ingest_key_id", "ingest_secret"])
def test_edge_worker_config_rejects_camera_backend_credentials(field_name: str) -> None:
    payload = edge_config_payload(camera_count=1)
    payload["cameras"][0][field_name] = "backend-secret"

    with pytest.raises(ValidationError, match=field_name):
        EdgeWorkerConfig.model_validate(payload)


def test_worker_relay_client_posts_to_local_relay_with_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from worker import edge_worker

    captured: list[tuple[str, dict[str, str], dict[str, object]]] = []

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> _FakeHTTPResponse:
        assert timeout == 0.5
        captured.append(
            (
                request.full_url,
                dict(request.header_items()),
                json.loads(request.data.decode("utf-8")),
            )
        )
        return _FakeHTTPResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    config = EdgeWorkerConfig.model_validate(edge_config_payload(camera_count=1))
    camera = config.cameras[0]
    client = edge_worker._relay_client(config, camera)

    client.emit(
        {
            "event_type": "bed-exit",
            "detected_at": "2026-06-23T12:00:00.000Z",
            "probability": 0.91,
        }
    )
    client.send_heartbeat()

    assert captured == [
        (
            "http://127.0.0.1:8000/relay/alerts",
            {"Content-type": "application/json", "X-edge-relay-token": "relay-token-1"},
            {
                "event_type": "bed-exit",
                "probability": 0.91,
                "detected_at": "2026-06-23T12:00:00.000Z",
                "camera_id": "camera-1",
                "facility_id": "facility-1",
                "evidence": {
                    "event_type": "bed-exit",
                    "detected_at": "2026-06-23T12:00:00.000Z",
                    "probability": 0.91,
                },
                "resident_id": "resident-1",
            },
        ),
        (
            "http://127.0.0.1:8000/relay/heartbeat",
            {"Content-type": "application/json", "X-edge-relay-token": "relay-token-1"},
            {"camera_id": "camera-1", "facility_id": "facility-1"},
        ),
    ]


def test_edge_ingest_client_alert_payload_is_fact_event_shaped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_payloads: list[dict[str, str | float]] = []

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> _FakeHTTPResponse:
        assert timeout == 0.2
        captured_payloads.append(json.loads(request.data.decode("utf-8")))
        return _FakeHTTPResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    client = EdgeIngestClient(
        alert_url="http://backend.local/ingest/alerts",
        heartbeat_url="http://backend.local/ingest/heartbeat",
        camera_id="camera-1",
        facility_id="facility-1",
        resident_id="resident-1",
        ingest_key_id="key-1",
        ingest_secret="secret-1",
        timeout_sec=0.2,
    )

    sent = client.send_alert(
        event_type="fall",
        detected_at="2026-06-23T12:00:00.000Z",
        probability=0.91,
    )

    assert sent is True
    assert captured_payloads == [
        {
            "resident_id": "resident-1",
            "facility_id": "facility-1",
            "probability": 0.91,
            "detected_at": "2026-06-23T12:00:00.000Z",
            "type": "fall",
        }
    ]
    assert _backend_policy_fields().isdisjoint(captured_payloads[0])


class _FakeHTTPResponse:
    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        return None

    def read(self) -> bytes:
        return b""


def _backend_policy_fields() -> set[str]:
    return {
        "notification_recipient",
        "notification_channel",
        "recipient",
        "channel",
        "dedup_key",
        "deduplication_key",
        "outbox_id",
        "kakao_template",
        "kakao_delivery_id",
    }
