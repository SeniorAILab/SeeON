from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from api.camera_registry import CameraRegistryStore
from api.main import create_app, no_lifespan


class FakeBackendIngestClient:
    def __init__(self, *, alert_ok: bool = True, heartbeat_ok: bool = True) -> None:
        self.alert_ok = alert_ok
        self.heartbeat_ok = heartbeat_ok
        self.alerts: list[dict] = []
        self.heartbeats = 0

    def send_alert(self, **kwargs) -> bool:
        self.alerts.append(kwargs)
        return self.alert_ok

    def send_heartbeat(self) -> bool:
        self.heartbeats += 1
        return self.heartbeat_ok


def _client(fake: FakeBackendIngestClient | None = None) -> TestClient:
    app = create_app(lifespan=no_lifespan)
    app.state.edge_relay_token = "relay-token"
    app.state.camera_inventory = {
        "camera-1": {
            "camera_id": "camera-1",
            "facility_id": "facility-1",
            "resident_id": "resident-1",
        }
    }
    app.state.backend_ingest_client = fake or FakeBackendIngestClient()
    return TestClient(app)


def _alert_payload(**overrides) -> dict:
    payload = {
        "event_type": "bed-exit",
        "probability": 0.87,
        "detected_at": "2026-06-25T12:00:00.000Z",
        "camera_id": "camera-1",
        "facility_id": "facility-1",
        "evidence": {"domain": "night-bed-exit", "clip_id": "clip-123"},
    }
    payload.update(overrides)
    return payload


def test_relay_alert_rejects_missing_token() -> None:
    response = _client().post("/api/v1/relay/alerts", json=_alert_payload())

    assert response.status_code == 401


def test_relay_alert_rejects_wrong_token() -> None:
    response = _client().post(
        "/api/v1/relay/alerts",
        json=_alert_payload(),
        headers={"X-Edge-Relay-Token": "wrong"},
    )

    assert response.status_code == 403


def test_relay_alert_rejects_unknown_camera() -> None:
    response = _client().post(
        "/api/v1/relay/alerts",
        json=_alert_payload(camera_id="camera-unknown"),
        headers={"X-Edge-Relay-Token": "relay-token"},
    )

    assert response.status_code == 403
    assert "unknown camera" in response.json()["detail"]


def test_relay_alert_rejects_facility_mismatch() -> None:
    response = _client().post(
        "/api/v1/relay/alerts",
        json=_alert_payload(facility_id="facility-2"),
        headers={"X-Edge-Relay-Token": "relay-token"},
    )

    assert response.status_code == 403
    assert "facility" in response.json()["detail"]


def test_relay_alert_forwards_valid_event_to_backend_ingest_client() -> None:
    fake = FakeBackendIngestClient()
    response = _client(fake).post(
        "/api/v1/relay/alerts",
        json=_alert_payload(),
        headers={"X-Edge-Relay-Token": "relay-token"},
    )

    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    assert fake.alerts == [
        {
            "event_type": "bed-exit",
            "detected_at": "2026-06-25T12:00:00.000Z",
            "probability": 0.87,
            "clip_id": "clip-123",
        }
    ]


def test_relay_alert_omits_missing_clip_id_for_backward_compatibility() -> None:
    fake = FakeBackendIngestClient()
    response = _client(fake).post(
        "/api/v1/relay/alerts",
        json=_alert_payload(evidence={"domain": "night-bed-exit"}),
        headers={"X-Edge-Relay-Token": "relay-token"},
    )

    assert response.status_code == 202
    assert fake.alerts == [
        {
            "event_type": "bed-exit",
            "detected_at": "2026-06-25T12:00:00.000Z",
            "probability": 0.87,
        }
    ]

def test_relay_heartbeat_forwards_valid_camera_to_backend_ingest_client() -> None:
    fake = FakeBackendIngestClient()
    response = _client(fake).post(
        "/api/v1/relay/heartbeat",
        json={"camera_id": "camera-1", "facility_id": "facility-1"},
        headers={"X-Edge-Relay-Token": "relay-token"},
    )

    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    assert fake.heartbeats == 1


def test_relay_accepts_canonical_camera_id_from_registry_when_inventory_missing(tmp_path) -> None:
    fake = FakeBackendIngestClient()
    app = create_app(lifespan=no_lifespan)
    app.state.edge_relay_token = "relay-token"
    store = CameraRegistryStore(tmp_path / "cameras.json")
    store.create(
        camera_id="provisional-camera",
        label="Lobby",
        rtsp_url="rtsp://camera/stream",
        space_id="space-1",
        status="online",
        backend_camera_id="backend-camera-1",
    )
    app.state.camera_registry = store
    app.state.camera_inventory = {}
    app.state.backend_ingest_client = fake

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/relay/heartbeat",
            json={"camera_id": "backend-camera-1", "facility_id": "local-facility"},
            headers={"X-Edge-Relay-Token": "relay-token"},
        )

    assert response.status_code == 202
    assert fake.heartbeats == 1

def test_relay_alert_rejects_raw_frame_payloads() -> None:
    payload = _alert_payload(frame=[0, 1, 2])

    response = _client().post(
        "/api/v1/relay/alerts",
        json=payload,
        headers={"X-Edge-Relay-Token": "relay-token"},
    )

    assert response.status_code == 422


def test_relay_alert_forwards_audit_and_snapshot_when_present() -> None:
    fake = FakeBackendIngestClient()
    response = _client(fake).post(
        "/api/v1/relay/alerts",
        json=_alert_payload(
            audit={
                "config_version": 7,
                "model_version": "rf-2026",
                "clock_source": "edge_wall_clock",
            },
            snapshot_jpeg_base64=base64.b64encode(b"jpeg-bytes").decode("ascii"),
        ),
        headers={"X-Edge-Relay-Token": "relay-token"},
    )

    assert response.status_code == 202
    assert len(fake.alerts) == 1
    forwarded = fake.alerts[0]
    assert forwarded["event_type"] == "bed-exit"
    assert forwarded["audit"] == {
        "config_version": 7,
        "model_version": "rf-2026",
        "clock_source": "edge_wall_clock",
    }
    assert forwarded["snapshot_bytes"] == b"jpeg-bytes"
