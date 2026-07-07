from __future__ import annotations

import json
import urllib.error
from typing import Self

import pytest
from fastapi.testclient import TestClient

from api.camera_registry import CameraRegistryStore, ProbeResult
from api.main import create_app, no_lifespan
from contracts.worker_config import PulledNightWindow, PulledWorkerConfig
from worker.config_pull import load_edge_worker_config_from_relay
from worker.edge_worker import _restart_check

AUTH = {"Authorization": "Bearer relay-token"}


class FakeHTTPResponse:
    def __init__(self, payload: dict[str, object], status: int = 200) -> None:
        self.payload = payload
        self.status = status

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


@pytest.fixture(autouse=True)
def clear_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "API_CAMERA_STORE",
        "API_EDGE_RELAY_TOKEN",
        "API_FACILITY_ID",
        "API_BACKEND_EDGE_CAMERAS_URL",
        "API_BACKEND_URL",
        "API_BACKEND_EVENTS_URL",
        "API_FACILITY_TOKEN",
        "API_BACKEND_FACILITY_TOKEN",
        "API_EDGE_FACILITY_TOKEN",
        "ML_EDGE_VERSION",
        "ML_WORKER_STATE_DIR",
        "RELAY_TOKEN",
        "RELAY_URL",
    ):
        monkeypatch.delenv(name, raising=False)


def test_camera_registry_crud_masks_rtsp_versions_and_worker_config_auth(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("API_CAMERA_STORE", str(tmp_path / "cameras.json"))
    monkeypatch.setenv("API_EDGE_RELAY_TOKEN", "relay-token")
    monkeypatch.setenv("API_FACILITY_ID", "facility-1")
    monkeypatch.setenv("API_BACKEND_EDGE_CAMERAS_URL", "http://backend/api/v1/edge/cameras")
    monkeypatch.setenv("API_FACILITY_TOKEN", "facility-token")
    monkeypatch.setattr(
        "api.routes.cameras.probe_rtsp_url",
        lambda rtsp_url: ProbeResult(ok=False, error_class="timeout"),
    )
    captured: list[dict[str, object]] = []

    def fake_urlopen(request, timeout: float) -> FakeHTTPResponse:
        captured.append(
            {
                "url": request.full_url,
                "method": request.get_method(),
                "authorization": request.headers.get("Authorization"),
                "facility_id": request.headers.get("X-facility-id"),
                "body": json.loads(request.data.decode("utf-8")),
                "timeout": timeout,
            }
        )
        return FakeHTTPResponse({"cameraId": "backend-camera-1"})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    with TestClient(create_app(lifespan=no_lifespan)) as client:
        created = client.post(
            "/api/v1/cameras",
            headers=AUTH,
            json={
                "label": "Lobby",
                "rtsp_url": "rtsp://user:secret@camera.local:8554/live",
                "space_id": "space-1",
            },
        )
        assert created.status_code == 201
        camera = created.json()
        assert camera["label"] == "Lobby"
        assert camera["rtsp_url_masked"] == "rtsp://***:***@camera.local:8554/live"
        assert "secret" not in json.dumps(camera)
        assert camera["backend_camera_id"] == "backend-camera-1"
        assert camera["id"] == "backend-camera-1"
        assert camera["status"] == "offline"

        listed = client.get("/api/v1/cameras", headers=AUTH).json()
        assert listed["registry_version"] == 1
        assert listed["cameras"] == [camera]

        assert client.get("/api/v1/cameras/worker-config").status_code == 401
        assert (
            client.get(
                "/api/v1/cameras/worker-config",
                headers={"X-Edge-Relay-Token": "wrong"},
            ).status_code
            == 403
        )
        worker_config = client.get(
            "/api/v1/cameras/worker-config",
            headers={"Authorization": "Bearer relay-token"},
        )
        assert worker_config.status_code == 200
        assert worker_config.json() == {
            "registry_version": 1,
            "cameras": [
                {
                    "camera_id": camera["id"],
                    "facility_id": "facility-1",
                    "rtsp_url": "rtsp://user:secret@camera.local:8554/live",
                }
            ],
        }

        relay_config = client.get(
            "/api/v1/relay/config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )
        assert relay_config.status_code == 200
        assert relay_config.json() == worker_config.json()

        patched = client.patch(
            f"/api/v1/cameras/{camera['id']}",
            headers=AUTH,
            json={"label": "Lobby North"},
        )
        assert patched.status_code == 200
        assert client.get("/api/v1/cameras", headers=AUTH).json()["registry_version"] == 2

        tested = client.post(f"/api/v1/cameras/{camera['id']}/test", headers=AUTH)
        assert tested.status_code == 200
        assert tested.json() == {"ok": False, "error_class": "timeout"}

        deleted = client.delete(f"/api/v1/cameras/{camera['id']}", headers=AUTH)
        assert deleted.status_code == 204
        after_delete = client.get("/api/v1/cameras", headers=AUTH).json()
        assert after_delete == {"registry_version": 3, "cameras": []}

    assert captured[0] == {
        "url": "http://backend/api/v1/edge/cameras",
        "method": "PUT",
        "authorization": "Bearer facility-token",
        "facility_id": "facility-1",
        "body": {
            "edge_camera_ref": captured[0]["body"]["edge_camera_ref"],
            "label": "Lobby",
            "spaceId": "space-1",
        },
        "timeout": 0.5,
    }


def test_worker_config_integrates_backend_metadata_without_second_roster(tmp_path) -> None:
    app = create_app(lifespan=no_lifespan)
    app.state.edge_relay_token = "relay-token"
    app.state.config_version = 42
    app.state.restart_epoch = 5
    app.state.pulled_config = PulledWorkerConfig(
        config_version=42,
        restart_epoch=5,
        night_window=PulledNightWindow(start="21:00", end="06:00", tz="UTC"),
        cameras=(),
    )
    store = app.state.camera_registry = CameraRegistryStore(tmp_path / "cameras.json")
    store.create(
        camera_id="camera-1",
        label="Lobby",
        rtsp_url="rtsp://camera/stream",
        space_id="space-1",
        status="online",
    )

    with TestClient(app) as client:
        worker_config = client.get(
            "/api/v1/cameras/worker-config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )
        relay_config = client.get(
            "/api/v1/relay/config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )

    assert worker_config.status_code == 200
    expected = {
        "registry_version": 1,
        "cameras": [
            {
                "camera_id": "camera-1",
                "facility_id": "local-facility",
                "rtsp_url": "rtsp://camera/stream",
            }
        ],
        "config_version": 42,
        "restart_epoch": 5,
        "night_window": {"start": "21:00", "end": "06:00", "tz": "UTC"},
    }
    assert worker_config.json() == expected
    assert relay_config.status_code == 200
    assert relay_config.json() == expected

def test_system_reports_backend_state_and_version(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BACKEND_URL", "http://backend")
    monkeypatch.setenv("ML_EDGE_VERSION", "2026.07.06")

    with TestClient(create_app(lifespan=no_lifespan)) as client:
        client.app.state.backend_reachable = True
        client.app.state.backend_last_ok_at = "2026-07-06T00:00:00.000Z"
        response = client.get("/api/v1/system")

    assert response.status_code == 200
    body = response.json()
    assert body["backend"] == {
        "configured": True,
        "reachable": True,
        "last_ok_at": "2026-07-06T00:00:00.000Z",
    }
    assert body["version"] == "2026.07.06"
    assert body["image_digests"] == {"ml_api": None, "ml_worker": None}
    assert set(body["storage"]["clip_store"]) == {"total_bytes", "used_bytes", "used_pct"}
    assert body["updated_at"].endswith("Z")


def test_config_pull_persists_lkg_and_falls_back(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ML_WORKER_STATE_DIR", str(tmp_path))
    payload = {
        "registry_version": 9,
        "cameras": [
            {
                "camera_id": "camera-1",
                "facility_id": "facility-1",
                "rtsp_url": "rtsp://camera/stream",
                "fps": 4,
                "domains": ["fall"],
            }
        ],
    }
    calls = {"count": 0}

    def fake_urlopen(request, timeout: float) -> FakeHTTPResponse:
        calls["count"] += 1
        assert request.full_url == "http://ml-api:8000/api/v1/cameras/worker-config"
        assert request.headers["X-edge-relay-token"] == "relay-token"
        return FakeHTTPResponse(payload)

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    pulled = load_edge_worker_config_from_relay("http://ml-api:8000", "relay-token")

    assert pulled is not None
    config, registry_version, source = pulled
    assert registry_version == 9
    assert source == "pulled"
    assert config.cameras[0].camera_id == "camera-1"
    assert config.cameras[0].fps == 4
    assert config.enabled_domains == ("fall",)

    def offline(request, timeout: float) -> FakeHTTPResponse:
        raise urllib.error.URLError("offline")

    monkeypatch.setattr("urllib.request.urlopen", offline)

    fallback = load_edge_worker_config_from_relay("http://ml-api:8000", "relay-token")

    assert fallback is not None
    _config, fallback_version, fallback_source = fallback
    assert fallback_version == 9
    assert fallback_source == "lkg"


def test_restart_check_detects_registry_version_change(monkeypatch: pytest.MonkeyPatch) -> None:
    versions = [1, 2]

    def fake_pull(relay_url: str, relay_token: str | None) -> PulledWorkerConfig:
        version = versions.pop(0)
        return PulledWorkerConfig(
            config_version=version,
            restart_epoch=version,
            night_window=None,
            cameras=(),
        )

    now = {"value": 0.0}
    monkeypatch.setattr("worker.edge_worker.pull_worker_config", fake_pull)
    check = _restart_check(
        "http://ml-api:8000",
        "relay-token",
        1,
        poll_interval_sec=60.0,
        monotonic=lambda: now["value"],
    )

    assert check() is False
    now["value"] = 61.0
    assert check() is True
