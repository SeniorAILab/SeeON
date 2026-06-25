from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import create_app, no_lifespan
from runners.registry import ModelRegistry


class StubModel:
    name = "fall-detector"
    version = "test"

    def metadata_dict(self):
        return {"name": self.name, "version": self.version, "model_type": "stub"}


def test_models_lists_registry_and_loaded_model_info() -> None:
    registry = ModelRegistry()
    registry.register("fall", lambda: object())
    app = create_app(lifespan=no_lifespan)
    app.state.model_registry = registry
    app.state.model = StubModel()
    app.state.device = "cpu"

    response = TestClient(app).get("/models")

    assert response.status_code == 200
    assert response.json() == {
        "registry": {"tasks": ["fall"]},
        "loaded_model": {"name": "fall-detector", "version": "test", "model_type": "stub"},
        "device": "cpu",
    }
