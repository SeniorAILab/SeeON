from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import create_app, no_lifespan
from runtime.status_store import CameraStatus, StatusStore


def test_status_reflects_status_store_ops_and_camera_state() -> None:
    store = StatusStore()
    store.set_status("cam-a", "facility-a", CameraStatus.OFFLINE, error_category="camera.offline")
    store.record_ops_event("camera.offline", "cam-a", "facility-a", "camera.offline", detail="down")
    app = create_app(lifespan=no_lifespan)
    app.state.status_store = store

    response = TestClient(app).get("/status")

    assert response.status_code == 200
    body = response.json()
    assert body["cameras"]["cam-a"]["status"] == "OFFLINE"
    assert body["ops_events"][0]["event_type"] == "camera.offline"
