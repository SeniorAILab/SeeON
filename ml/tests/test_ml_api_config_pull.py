from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Self

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from contracts.worker_config import CONFIG_VERSION_KEY, RESTART_EPOCH_KEY, PulledWorkerConfig


class FakeBackendIngestClient:
    def __init__(self) -> None:
        self.heartbeats = 0

    def send_alert(self, **kwargs) -> bool:
        return True

    def send_heartbeat(self) -> bool:
        self.heartbeats += 1
        return True


class FakeHTTPResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


@pytest.fixture(autouse=True)
def clear_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "API_EDGE_RELAY_TOKEN",
        "API_CAMERA_INVENTORY",
        "API_FACILITY_ID",
        "API_BACKEND_CONFIG_URL",
        "API_BACKEND_EVENTS_URL",
    ):
        monkeypatch.delenv(name, raising=False)


def _backend_config() -> dict[str, object]:
    return {
        "configVersion": 7,
        "nightWindow": {"start": "21:00", "end": "06:00", "tz": "Asia/Seoul"},
        "cameras": [
            {
                "id": "cam-pulled-1",
                "spaceId": "room-101",
                "label": "Room 101",
                "rtspUrl": "rtsp://camera/101",
                "online": True,
            },
            {
                "id": "cam-pulled-2",
                "spaceId": "room-102",
                "label": "Room 102",
                "rtspUrl": None,
                "online": False,
            },
        ],
    }


def _set_pull_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_EDGE_RELAY_TOKEN", "relay-token")
    monkeypatch.setenv("API_FACILITY_ID", "facility-pulled")
    monkeypatch.setenv("API_BACKEND_CONFIG_URL", "http://backend:3000/api/v1/ml-config/")


def test_backend_config_pull_seeds_inventory_and_worker_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[tuple[str, float]] = []

    def fake_urlopen(url: str, timeout: float) -> FakeHTTPResponse:
        captured.append((url, timeout))
        return FakeHTTPResponse(_backend_config())

    _set_pull_env(monkeypatch)
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    with TestClient(create_app()) as client:
        app = client.app
        assert captured == [("http://backend:3000/api/v1/ml-config/facility-pulled", 0.5)]
        assert app.state.config_version == 7
        assert app.state.camera_inventory == {
            "cam-pulled-1": {
                "camera_id": "cam-pulled-1",
                "facility_id": "facility-pulled",
                "resident_id": None,
            },
            "cam-pulled-2": {
                "camera_id": "cam-pulled-2",
                "facility_id": "facility-pulled",
                "resident_id": None,
            },
        }

        response = client.get(
            "/api/v1/relay/config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )

    assert response.status_code == 200
    assert response.json() == PulledWorkerConfig.from_dict(
        {
            "config_version": 7,
            "restart_epoch": 0,
            "night_window": {"start": "21:00", "end": "06:00", "tz": "Asia/Seoul"},
            "cameras": [
                {
                    "camera_id": "cam-pulled-1",
                    "space_id": "room-101",
                    "label": "Room 101",
                    "rtsp_url": "rtsp://camera/101",
                    "online": True,
                },
                {
                    "camera_id": "cam-pulled-2",
                    "space_id": "room-102",
                    "label": "Room 102",
                    "rtsp_url": None,
                    "online": False,
                },
            ],
        }
    ).as_dict()


def test_backend_config_pull_failure_keeps_env_inventory_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_urlopen(url: str, timeout: float) -> FakeHTTPResponse:
        raise TimeoutError("boom")

    _set_pull_env(monkeypatch)
    monkeypatch.setenv(
        "API_CAMERA_INVENTORY",
        json.dumps(
            [
                {
                    "camera_id": "cam-env",
                    "facility_id": "facility-env",
                    "resident_id": "resident-env",
                }
            ]
        ),
    )
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    with TestClient(create_app()) as client:
        assert client.app.state.pulled_config is None
        assert client.app.state.camera_inventory == {
            "cam-env": {
                "camera_id": "cam-env",
                "facility_id": "facility-env",
                "resident_id": "resident-env",
            }
        }


def test_config_and_restart_require_token_and_restart_reflects_live_epoch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_pull_env(monkeypatch)
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        lambda url, timeout: FakeHTTPResponse(_backend_config()),
    )

    with TestClient(create_app()) as client:
        assert client.get("/api/v1/relay/config").status_code == 401
        assert (
            client.get(
                "/api/v1/relay/config",
                headers={"X-Edge-Relay-Token": "wrong"},
            ).status_code
            == 403
        )
        assert client.post("/api/v1/relay/restart").status_code == 401
        assert (
            client.post(
                "/api/v1/relay/restart",
                headers={"X-Edge-Relay-Token": "wrong"},
            ).status_code
            == 403
        )

        restart = client.post(
            "/api/v1/relay/restart",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )
        config = client.get(
            "/api/v1/relay/config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )

    assert restart.status_code == 202
    assert restart.json() == {RESTART_EPOCH_KEY: 1}
    assert config.json()[RESTART_EPOCH_KEY] == 1
    assert config.json()[CONFIG_VERSION_KEY] == 7


def test_heartbeat_config_version_surfaces_in_status_and_remains_optional(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("API_EDGE_RELAY_TOKEN", "relay-token")
    monkeypatch.setenv(
        "API_CAMERA_INVENTORY",
        json.dumps(
            [
                {"camera_id": "cam-1", "facility_id": "facility-1"},
                {"camera_id": "cam-2", "facility_id": "facility-1"},
            ]
        ),
    )

    with TestClient(create_app()) as client:
        client.app.state.backend_ingest_client = FakeBackendIngestClient()
        with_version = client.post(
            "/api/v1/relay/heartbeat",
            json={"camera_id": "cam-1", "facility_id": "facility-1", "config_version": 7},
            headers={"X-Edge-Relay-Token": "relay-token"},
        )
        without_version = client.post(
            "/api/v1/relay/heartbeat",
            json={"camera_id": "cam-2", "facility_id": "facility-1"},
            headers={"X-Edge-Relay-Token": "relay-token"},
        )
        status = client.get("/api/v1/status")

    assert with_version.status_code == 202
    assert without_version.status_code == 202
    assert status.json()["cameras"]["cam-1"]["config_version"] == 7
    assert status.json()["cameras"]["cam-2"]["config_version"] is None


def test_config_returns_503_when_backend_config_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Relay token + env inventory present, but NO backend pull configured, so
    # app.state.pulled_config stays None. /config MUST signal UNAVAILABLE (503)
    # rather than emit an empty 200 that the worker would persist as LKG,
    # clobbering a valid last-known-good config.
    monkeypatch.setenv("API_EDGE_RELAY_TOKEN", "relay-token")
    monkeypatch.setenv(
        "API_CAMERA_INVENTORY",
        json.dumps([{"camera_id": "cam-1", "facility_id": "facility-1"}]),
    )

    with TestClient(create_app()) as client:
        assert client.app.state.pulled_config is None
        response = client.get(
            "/api/v1/relay/config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )

    assert response.status_code == 503


def test_config_refresh_reflects_backend_change_without_restart(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configs = [
        _backend_config(),  # boot -> config_version 7
        {  # first GET re-pull -> changed backend config, no restart
            "configVersion": 8,
            "nightWindow": {"start": "22:00", "end": "05:00", "tz": "Asia/Seoul"},
            "cameras": [],
        },
    ]
    calls = {"n": 0}

    def fake_urlopen(url: str, timeout: float) -> FakeHTTPResponse:
        payload = configs[min(calls["n"], len(configs) - 1)]
        calls["n"] += 1
        return FakeHTTPResponse(payload)

    _set_pull_env(monkeypatch)
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    with TestClient(create_app()) as client:
        assert client.app.state.config_version == 7  # boot pulled the first config
        response = client.get(
            "/api/v1/relay/config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )

    # The GET re-pulled backend config live, surfacing the change WITHOUT restart.
    assert response.status_code == 200
    assert response.json()["config_version"] == 8
    assert response.json()["night_window"] == {
        "start": "22:00",
        "end": "05:00",
        "tz": "Asia/Seoul",
    }


def test_config_refresh_preserves_last_good_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = {"n": 0}

    def fake_urlopen(url: str, timeout: float) -> FakeHTTPResponse:
        calls["n"] += 1
        if calls["n"] == 1:
            return FakeHTTPResponse(_backend_config())  # boot success -> version 7
        raise urllib.error.URLError("backend down")  # refresh fails

    _set_pull_env(monkeypatch)
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    with TestClient(create_app()) as client:
        assert client.app.state.config_version == 7
        response = client.get(
            "/api/v1/relay/config",
            headers={"X-Edge-Relay-Token": "relay-token"},
        )

    # A transient refresh failure preserves the last-good config (200, not 503/blanked).
    assert response.status_code == 200
    assert response.json()["config_version"] == 7
