from __future__ import annotations

from fastapi.testclient import TestClient

from serving.main import create_app, no_lifespan
from serving.model import ModelLoadError


class StubModel:
    name = "fall-detector"
    version = "test"


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
        status = client.get("/status").json()

    assert response.status_code == 503
    assert response.json()["reason"] == "model.load_failed"
    assert status["ops_events"][0]["event_type"] == "model.load_failed"


def test_health_ready_200_when_model_loads() -> None:
    app = create_app()
    app.state.model_loader = lambda: StubModel()
    app.state.source_registry_loader = lambda: None
    app.state.runner_warmup = lambda runner: runner
    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["ready"] is True
