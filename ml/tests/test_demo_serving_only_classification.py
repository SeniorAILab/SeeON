from __future__ import annotations

import pytest

from api.client import ServingFallClassifier
from contracts import Frame, FrameObservation
from demo.classifiers import CLASSIFIER_REGISTRY, ClassifierParams, available_classifier_keys
from demo.demo_ui import build_model
from demo.temporal_module import TemporalFallClassifierModule


class _FakePose:
    """Pose ModelModule stand-in.

    build_model constructs a real YoloPoseModule (which loads ultralytics) before
    routing to the fall classifier. These tests only exercise the routing/api
    seam, so we patch in this lightweight pose to keep ultralytics out of
    sys.modules — the api import-boundary test (test_serving_model) asserts
    ultralytics is never imported by the loader path, and that check is global.
    """

    def __init__(self, size: str = "n", confidence: float = 0.05) -> None:
        self.size = size
        self.confidence = confidence

    def predict(self, frame: Frame) -> FrameObservation:  # pragma: no cover - never called
        return FrameObservation()


@pytest.fixture(autouse=True)
def _stub_pose(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("demo.demo_ui.YoloPoseModule", _FakePose)


def test_registry_excludes_rule_based() -> None:
    assert all(spec.key != "rule_based" for spec in CLASSIFIER_REGISTRY)


def test_removed_classifier_module_symbol_is_not_importable() -> None:
    with pytest.raises(ImportError):
        from demo.classifier_module import FallClassifierModule  # noqa: F401


def test_removed_rule_based_symbol_is_not_importable() -> None:
    with pytest.raises((ImportError, AttributeError)):
        from demo.classifiers import RuleBasedClassifier  # noqa: F401


def test_build_model_rejects_rule_based_key() -> None:
    with pytest.raises(ValueError, match="api-only via temporal models"):
        build_model("n", "rule_based", ClassifierParams())


def _first_available_temporal_key() -> str:
    keys = available_classifier_keys()
    if not keys:
        pytest.skip("No available temporal models on this machine")
    return keys[0]


def test_temporal_build_requires_serving_url(monkeypatch: pytest.MonkeyPatch) -> None:
    key = _first_available_temporal_key()
    monkeypatch.delenv("FALL_SERVING_URL", raising=False)

    with pytest.raises(RuntimeError, match="FALL_SERVING_URL is required"):
        build_model("n", key, ClassifierParams())


def test_temporal_build_uses_serving_classifier(monkeypatch: pytest.MonkeyPatch) -> None:
    key = _first_available_temporal_key()
    monkeypatch.setenv("FALL_SERVING_URL", "http://127.0.0.1:8000")

    model = build_model("n", key, ClassifierParams())

    assert isinstance(model, TemporalFallClassifierModule)
    assert isinstance(model._model, ServingFallClassifier)
