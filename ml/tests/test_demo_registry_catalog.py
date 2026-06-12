"""Registry-driven demo exposure (demo-registry-driven-model-loading plan).

Pins the lockstep chain CATALOG → training REGISTRY → demo TEMPORAL_MODEL_KEYS
→ CLASSIFIER_REGISTRY, and the threshold-default resolution order
(NH-recommended mapping first, artifact metadata fallback).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from demo.classifiers import CLASSIFIER_REGISTRY
from demo.temporal_module import (
    _KEY_TO_ARTIFACT,
    _KEY_TO_MODE,
    TEMPORAL_MODEL_KEYS,
    build_temporal_model,
)
from demo.thresholds import NH_RECOMMENDED_THRESHOLDS, default_threshold
from training.data.features import extract_window_features
from training.metadata import ModelMetadata, save_metadata
from training.models.catalog import CATALOG, load_model_class


class TestCatalogLockstep:
    def test_registry_built_from_catalog(self) -> None:
        from training.models import REGISTRY

        assert set(REGISTRY) == set(CATALOG)
        for key, entry in CATALOG.items():
            assert REGISTRY[key]["mode"] == entry.mode
            assert REGISTRY[key]["artifact_filename"] == entry.artifact_filename
            assert REGISTRY[key]["factory"].__name__ == entry.class_name

    def test_load_model_class_resolves_every_key(self) -> None:
        for key, entry in CATALOG.items():
            assert load_model_class(key).__name__ == entry.class_name

    def test_demo_keys_are_underscore_form_of_catalog(self) -> None:
        assert set(TEMPORAL_MODEL_KEYS) == {k.replace("-", "_") for k in CATALOG}
        for demo_key, artifact_key in _KEY_TO_ARTIFACT.items():
            assert demo_key == artifact_key.replace("-", "_")
            assert _KEY_TO_MODE[demo_key] == CATALOG[artifact_key].mode

    def test_classifier_registry_covers_all_temporal_keys(self) -> None:
        registry_keys = {spec.key for spec in CLASSIFIER_REGISTRY}
        assert registry_keys == {"rule_based", *TEMPORAL_MODEL_KEYS}

    def test_unavailable_spec_marked_준비중(self) -> None:
        for spec in CLASSIFIER_REGISTRY:
            if spec.key == "rule_based":
                continue
            assert spec.display_name.endswith("(준비중)") != spec.available


class TestThresholdDefaults:
    def test_nh_recommended_takes_precedence(self) -> None:
        assert default_threshold("gcn") == pytest.approx(0.30)
        assert default_threshold("random_forest") == pytest.approx(0.20)

    def test_nh_keys_are_valid_demo_keys(self) -> None:
        assert set(NH_RECOMMENDED_THRESHOLDS) <= set(TEMPORAL_MODEL_KEYS)

    def test_metadata_fallback_for_non_nh_key(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        assert "svm" not in NH_RECOMMENDED_THRESHOLDS
        _write_metadata(tmp_path, operating_threshold=0.77)
        monkeypatch.setattr("demo.thresholds.artifact_dir", lambda key: tmp_path)
        assert default_threshold("svm") == pytest.approx(0.77)

    def test_none_when_artifact_absent(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("demo.thresholds.artifact_dir", lambda key: tmp_path / "missing")
        assert default_threshold("svm") is None

    def test_none_for_unknown_key(self) -> None:
        assert default_threshold("__nonexistent__") is None


class TestThresholdOverridePlumbing:
    def test_build_temporal_model_honors_override(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _build_rf_artifact(tmp_path)
        monkeypatch.setattr("demo.temporal_module.artifact_dir", lambda key: tmp_path)
        module = build_temporal_model("random_forest", _NullPose(), threshold_override=0.42)
        assert module._operating_threshold == pytest.approx(0.42)

    def test_build_temporal_model_defaults_to_metadata(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _build_rf_artifact(tmp_path)
        monkeypatch.setattr("demo.temporal_module.artifact_dir", lambda key: tmp_path)
        module = build_temporal_model("random_forest", _NullPose())
        assert module._operating_threshold == pytest.approx(0.5)

    def test_unknown_key_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Unknown temporal model key"):
            build_temporal_model("__nonexistent__", _NullPose())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _NullPose:
    def predict(self, frame):  # pragma: no cover - never driven in these tests
        from demo.seam import DetectionResult

        return DetectionResult()


def _write_metadata(adir: Path, operating_threshold: float) -> None:
    save_metadata(
        adir,
        ModelMetadata(
            model_type="svm",
            framework="sklearn",
            window=30,
            stride=5,
            input_shape=None,
            feature_dim=45,
            seed=42,
            operating_threshold=operating_threshold,
        ),
    )


def _build_rf_artifact(adir: Path, window: int = 30, stride: int = 5) -> None:
    from training.models.rf import RandomForestFallClassifier

    fall_window = np.zeros((window, 17, 3), dtype=np.float32)
    for t in range(window):
        fall_window[t, :] = [0.0, 1.0, 0.9] if t % 2 == 0 else [1.0, 0.0, 0.9]
    normal_window = np.full((window, 17, 3), 0.5, dtype=np.float32)
    normal_window[:, :, 2] = 0.9

    X = np.vstack(
        [
            np.tile(extract_window_features(normal_window), (50, 1)),
            np.tile(extract_window_features(fall_window), (50, 1)),
        ]
    )
    y = np.array([0] * 50 + [1] * 50, dtype=np.int64)
    rf = RandomForestFallClassifier()
    rf.fit(X, y)
    rf.save(adir)
    save_metadata(
        adir,
        ModelMetadata(
            model_type="random-forest",
            framework="sklearn",
            window=window,
            stride=stride,
            input_shape=None,
            feature_dim=45,
            seed=42,
            operating_threshold=0.5,
        ),
    )
