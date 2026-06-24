from __future__ import annotations

import json
import urllib.request
from typing import Self

import pytest
from edge_worker_fixtures import edge_config_payload

from events.edge_ingest_client import EdgeIngestClient
from runtime.edge_worker_config import EdgeWorkerConfig, EdgeWorkerConfigError


def test_edge_worker_config_derives_backend_heartbeat_ingest_url() -> None:
    payload = edge_config_payload(camera_count=1)
    del payload["heartbeat_api_url"]

    config = EdgeWorkerConfig.model_validate(payload)

    assert config.alert_api_url == "http://backend.local/ingest/alerts"
    assert config.resolved_heartbeat_api_url == "http://backend.local/ingest/heartbeat"


def test_edge_worker_config_normalizes_ingest_url_before_deriving_heartbeat() -> None:
    payload = edge_config_payload(camera_count=1)
    payload["alert_api_url"] = "http://backend.local/ingest/alerts/"
    del payload["heartbeat_api_url"]

    config = EdgeWorkerConfig.model_validate(payload)

    assert config.alert_api_url == "http://backend.local/ingest/alerts"
    assert config.resolved_heartbeat_api_url == "http://backend.local/ingest/heartbeat"


@pytest.mark.parametrize(
    ("field_name", "bad_url"),
    [
        ("alert_api_url", "http://serving.local/debug/predict/window"),
        ("alert_api_url", "http://serving.local/predict"),
        ("alert_api_url", "http://backend.local/api/alerts"),
        ("alert_api_url", "http:///ingest/alerts"),
        ("alert_api_url", "http://backend.local/ingest/alerts?debug=true"),
        ("alert_api_url", "http://backend.local/ingest/alerts#fragment"),
        ("heartbeat_api_url", "http://serving.local/debug/predict/source"),
        ("heartbeat_api_url", "http://serving.local/predict"),
        ("heartbeat_api_url", "http://backend.local/status/heartbeat"),
        ("heartbeat_api_url", "http:///ingest/heartbeat"),
        ("heartbeat_api_url", "http://backend.local/ingest/heartbeat?debug=true"),
        ("heartbeat_api_url", "http://backend.local/ingest/heartbeat#fragment"),
    ],
)
def test_edge_worker_config_rejects_non_ingest_targets(
    field_name: str, bad_url: str
) -> None:
    payload = edge_config_payload(camera_count=1)
    payload[field_name] = bad_url

    with pytest.raises(EdgeWorkerConfigError, match=field_name):
        EdgeWorkerConfig.model_validate(payload)


def test_worker_ingest_client_uses_backend_ingest_urls() -> None:
    from worker import edge_worker

    config = EdgeWorkerConfig.model_validate(edge_config_payload(camera_count=1))
    camera = config.cameras[0]

    client = edge_worker._ingest_client(config, camera)

    assert client.alert_url == "http://backend.local/ingest/alerts"
    assert client.heartbeat_url == "http://backend.local/ingest/heartbeat"


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
