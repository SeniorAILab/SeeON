from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import create_app, no_lifespan
from api.model import ModelLoadError


class _StubMetadata:
    window = 1


class StubModel:
    name = "fall-detector"
    version = "test"
    metadata = _StubMetadata()

    def predict(self, features) -> float:
        del features
        return 0.0


def test_health_live_ok() -> None:
    with TestClient(create_app(lifespan=no_lifespan)) as client:
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_ready_503_when_model_load_fails() -> None:
    app = create_app()
    app.state.model_loader = lambda: (_ for _ in ()).throw(ModelLoadError("boom"))
    app.state.source_registry_loader = lambda: None
    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["reason"] == "model.load_failed"


def test_health_ready_200_when_model_loads() -> None:
    app = create_app()
    app.state.model_loader = lambda: StubModel()
    app.state.source_registry_loader = lambda: None
    app.state.runner_warmup = lambda runner: runner
    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["ready"] is True


def test_fastapi_lifespan_does_not_assemble_camera_runtime() -> None:
    app = create_app()
    app.state.model_loader = lambda: StubModel()
    app.state.source_registry_loader = lambda: None
    app.state.runner_warmup = lambda runner: runner

    with TestClient(app) as client:
        status_body = client.get("/api/v1/status").json()

    # ml-api must not assemble a worker camera runtime (ADR-067).
    assert not hasattr(app.state, "runtime")
    assert not hasattr(app.state, "incident_manager")
    # /api/v1/status is heartbeat-derived; no camera loop started -> no heartbeats.
    assert status_body["cameras"] == {}
    assert "stale_after_sec" in status_body
