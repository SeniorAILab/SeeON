from __future__ import annotations

import inspect
import json

import numpy as np

import demo.temporal_module as temporal_module
from api.client import PREDICT_WINDOW_PATH, ServingFallClassifier


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps({"fall_probability": 0.42}).encode("utf-8")


def test_serving_fall_classifier_posts_to_debug_predict_window(monkeypatch) -> None:
    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["body"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    classifier = ServingFallClassifier("http://api.local/", timeout_sec=1.5)

    probabilities = classifier.predict_proba(np.zeros((1, 2, 51), dtype=np.float32))

    assert captured["url"] == "http://api.local/api/v1/debug/predict/window"
    assert captured["body"] == {"window": [[0.0] * 51, [0.0] * 51]}
    assert captured["timeout"] == 1.5
    np.testing.assert_allclose(probabilities, [[0.58, 0.42]], rtol=1e-6)


def test_demo_uses_real_serving_client_route() -> None:
    classifier = ServingFallClassifier("http://api.local")

    assert classifier._url.endswith(PREDICT_WINDOW_PATH)
    assert not classifier._url.endswith("/predict")
    source = inspect.getsource(temporal_module.build_temporal_model)
    assert "ServingFallClassifier(serving_url)" in source
    assert "load_model_class" not in source
    assert "FALL_SERVING_URL is required" in source
