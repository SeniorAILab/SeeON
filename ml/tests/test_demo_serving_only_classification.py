from __future__ import annotations

import pytest

from contracts import Frame, FrameObservation
from demo.classifiers import CLASSIFIER_REGISTRY, ClassifierParams, available_classifier_keys
from demo.demo_ui import build_model
from demo.temporal_module import InProcessFallClassifier, TemporalFallClassifierModule


class _FakePose:
    """Pose ModelModule stand-in.

    build_model constructs a real YoloPoseModule (which loads ultralytics) before
    routing/classifier seam, so we patch in this lightweight pose to keep
    ultralytics out of sys.modules.
    """

    def __init__(self, size: str = "n", confidence: float = 0.05) -> None:
        self.size = size
        self.confidence = confidence

    def predict(self, frame: Frame) -> FrameObservation:  # pragma: no cover - never called
        return FrameObservation()


class _FakeInProcessFallClassifier:
    pass


@pytest.fixture(autouse=True)
def _stub_pose(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("demo.demo_ui.YoloPoseModule", _FakePose)
    monkeypatch.setattr(
        "demo.temporal_module.InProcessFallClassifier", _FakeInProcessFallClassifier
    )


def test_registry_excludes_rule_based() -> None:
    assert all(spec.key != "rule_based" for spec in CLASSIFIER_REGISTRY)


def test_removed_classifier_module_symbol_is_not_importable() -> None:
    with pytest.raises(ImportError):
        from demo.classifier_module import FallClassifierModule  # noqa: F401


def test_removed_rule_based_symbol_is_not_importable() -> None:
    with pytest.raises((ImportError, AttributeError)):
        from demo.classifiers import RuleBasedClassifier  # noqa: F401


def test_build_model_rejects_rule_based_key() -> None:
    with pytest.raises(ValueError, match="in-process temporal models"):
        build_model("n", "rule_based", ClassifierParams())


def _first_available_temporal_key() -> str:
    keys = available_classifier_keys()
    if not keys:
        pytest.skip("No available temporal models on this machine")
    return keys[0]


def test_temporal_build_does_not_require_serving_url(monkeypatch: pytest.MonkeyPatch) -> None:
    key = _first_available_temporal_key()
    monkeypatch.delenv("FALL_SERVING_URL", raising=False)

    model = build_model("n", key, ClassifierParams())

    assert isinstance(model, TemporalFallClassifierModule)


def test_temporal_build_uses_in_process_classifier() -> None:
    key = _first_available_temporal_key()

    model = build_model("n", key, ClassifierParams())

    assert isinstance(model, TemporalFallClassifierModule)
    assert isinstance(model._model, _FakeInProcessFallClassifier)
    assert not isinstance(model._model, InProcessFallClassifier)
