from __future__ import annotations

from fastapi.testclient import TestClient

from serving.main import create_app, no_lifespan


class StubModel:
    name = "fall-detector"
    version = "test"
    operating_threshold = 0.5

    def predict(self, features):
        return 0.73


def _window() -> list[list[float]]:
    frame = []
    for index in range(17):
        frame.extend([0.1 + index * 0.01, 0.2 + index * 0.01, 0.9])
    return [frame, list(frame)]


def _client() -> TestClient:
    app = create_app(lifespan=no_lifespan)
    app.state.model = StubModel()
    return TestClient(app)


def test_debug_predict_window_works() -> None:
    response = _client().post("/debug/predict/window", json={"window": _window()})

    assert response.status_code == 200
    assert response.json()["fall_probability"] == 0.73
    assert response.json()["is_fall"] is True


def test_predict_alias_removed() -> None:
    response = _client().post("/predict", json={"window": _window()})

    assert response.status_code == 404
