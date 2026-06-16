"""Strict serving model loader for trained fall-detection artifacts.

Models live under the single model root (ADR-015):
    ml/models/fall/<model_type>/{model.pkl, metadata.json}

This module is intentionally loader-only: it does not construct frame sources,
pose runners, demo UI modules, or the training extraction pipeline. The S2
serving contract accepts the existing keypoint-window request schema and runs
that window through the trained random-forest classifier.
"""

from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from training.data.features import extract_window_features

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
SUPPORTED_MODEL_TYPES = {"random-forest"}
EXPECTED_FEATURE_DIM = 45
EXPECTED_WINDOW = 30
EXPECTED_STRIDE = 5
KEYPOINT_VECTOR_DIM = 51


class ModelLoadError(RuntimeError):
    """Raised when a serving artifact cannot be loaded honestly."""


class ModelInputError(ValueError):
    """Raised when a prediction window violates the trained model contract."""


@dataclass(frozen=True)
class ModelMetadata:
    model_type: str
    framework: str
    window: int
    stride: int
    feature_dim: int
    name: str
    version: str
    operating_threshold: float
    classes: tuple[int, ...]
    outputs: tuple[str, ...]
    raw: dict[str, Any]

    @classmethod
    def from_dict(cls, data: Any, *, expected_model_type: str) -> ModelMetadata:
        if not isinstance(data, dict):
            raise ModelLoadError("metadata.json must contain a JSON object")

        required = {
            "model_type": str,
            "framework": str,
            "window": int,
            "stride": int,
            "feature_dim": int,
            "name": str,
            "version": str,
            "operating_threshold": (int, float),
            "classes": list,
            "outputs": list,
        }
        for key, expected_type in required.items():
            value = data.get(key)
            if not isinstance(value, expected_type):
                raise ModelLoadError(
                    f"metadata.json field {key!r} has invalid shape; expected {expected_type}"
                )

        model_type = data["model_type"]
        if model_type != expected_model_type:
            raise ModelLoadError(
                f"metadata model_type {model_type!r} does not match requested {expected_model_type!r}"
            )
        if model_type not in SUPPORTED_MODEL_TYPES:
            raise ModelLoadError(f"unsupported model_type {model_type!r}")
        if data["framework"] != "sklearn":
            raise ModelLoadError(f"unsupported framework {data['framework']!r} for {model_type!r}")
        if data["feature_dim"] != EXPECTED_FEATURE_DIM:
            raise ModelLoadError(
                f"metadata feature_dim {data['feature_dim']} does not match expected {EXPECTED_FEATURE_DIM}"
            )
        if data["window"] != EXPECTED_WINDOW:
            raise ModelLoadError(
                f"metadata window {data['window']} does not match expected {EXPECTED_WINDOW}"
            )
        if data["stride"] != EXPECTED_STRIDE:
            raise ModelLoadError(
                f"metadata stride {data['stride']} does not match expected {EXPECTED_STRIDE}"
            )
        if data["classes"] != [0, 1]:
            raise ModelLoadError("metadata classes must be [0, 1] for fall probability output")
        if "fall_prob" not in data["outputs"]:
            raise ModelLoadError("metadata outputs must include 'fall_prob'")

        return cls(
            model_type=model_type,
            framework=data["framework"],
            window=data["window"],
            stride=data["stride"],
            feature_dim=data["feature_dim"],
            name=data["name"],
            version=data["version"],
            operating_threshold=float(data["operating_threshold"]),
            classes=tuple(int(c) for c in data["classes"]),
            outputs=tuple(str(output) for output in data["outputs"]),
            raw=dict(data),
        )


class FallDetector:
    def __init__(self, name: str = "fall-detector", model_type: str = "random-forest") -> None:
        if model_type not in SUPPORTED_MODEL_TYPES:
            raise ModelLoadError(
                f"unsupported model_type {model_type!r}; expected one of {sorted(SUPPORTED_MODEL_TYPES)}"
            )
        self.model_type = model_type
        self.artifact_dir = MODELS_DIR / "fall" / model_type
        self.metadata = self._load_metadata(model_type)
        self.name = name or self.metadata.name
        self._model = self._load_model()
        self._validate_model_contract()

    def _load_metadata(self, model_type: str) -> ModelMetadata:
        meta_path = self.artifact_dir / "metadata.json"
        if not meta_path.exists():
            raise ModelLoadError(f"metadata.json missing for {model_type!r} at {meta_path}")
        try:
            data = json.loads(meta_path.read_text())
        except json.JSONDecodeError as exc:
            raise ModelLoadError(f"metadata.json is invalid JSON at {meta_path}: {exc}") from exc
        return ModelMetadata.from_dict(data, expected_model_type=model_type)

    def _load_model(self) -> Any:
        model_path = self.artifact_dir / "model.pkl"
        if not model_path.exists():
            raise ModelLoadError(f"model.pkl missing for {self.model_type!r} at {model_path}")

        try:
            import joblib

            model = joblib.load(model_path)
        except ImportError:
            try:
                with model_path.open("rb") as fh:
                    model = pickle.load(fh)
            except Exception as exc:
                raise ModelLoadError(f"model.pkl could not be loaded with pickle at {model_path}: {exc}") from exc
        except Exception as exc:
            raise ModelLoadError(f"model.pkl could not be loaded with joblib at {model_path}: {exc}") from exc

        if not hasattr(model, "predict_proba"):
            raise ModelLoadError("model.pkl artifact does not expose predict_proba")
        return model

    def _validate_model_contract(self) -> None:
        n_features = getattr(self._model, "n_features_in_", None)
        if n_features is not None and int(n_features) != self.metadata.feature_dim:
            raise ModelLoadError(
                f"model feature_dim {n_features} does not match metadata feature_dim "
                f"{self.metadata.feature_dim}"
            )
        classes = list(getattr(self._model, "classes_", []))
        if classes and classes != list(self.metadata.classes):
            raise ModelLoadError(
                f"model classes {classes!r} do not match metadata classes {self.metadata.classes!r}"
            )

    def metadata_dict(self) -> dict[str, Any]:
        return dict(self.metadata.raw)

    def predict(self, window: list[list[float]] | None = None) -> float:
        """Return a trained random-forest fall probability in [0, 1]."""
        features = self._features_from_window(window)
        probs = self._model.predict_proba(features.reshape(1, -1))[0]
        classes = list(getattr(self._model, "classes_", self.metadata.classes))
        try:
            fall_idx = classes.index(1)
        except ValueError as exc:
            raise ModelLoadError("model classes do not include fall class 1") from exc
        return float(probs[fall_idx])

    def _features_from_window(self, window: list[list[float]] | None) -> np.ndarray:
        if window is None:
            raise ModelInputError("window is required; no fake fallback probability is available")

        arr = np.asarray(window, dtype=np.float32)
        if arr.ndim != 2:
            raise ModelInputError(
                f"window must be a 2D list with shape [{self.metadata.window}, {KEYPOINT_VECTOR_DIM}] "
                f"or [1, {self.metadata.feature_dim}], got {arr.shape}"
            )

        if arr.shape == (1, self.metadata.feature_dim):
            features = arr[0]
        elif arr.shape == (self.metadata.window, KEYPOINT_VECTOR_DIM):
            keypoint_window = arr.reshape(self.metadata.window, 17, 3)
            features = extract_window_features(keypoint_window)
        else:
            raise ModelInputError(
                f"window shape {arr.shape} does not match trained contract "
                f"[{self.metadata.window}, {KEYPOINT_VECTOR_DIM}] or [1, {self.metadata.feature_dim}]"
            )

        if features.shape != (self.metadata.feature_dim,):
            raise ModelInputError(
                f"feature vector shape {features.shape} does not match metadata feature_dim "
                f"{self.metadata.feature_dim}"
            )
        if not np.isfinite(features).all():
            raise ModelInputError("feature vector contains NaN or infinite values")
        return features.astype(np.float32, copy=False)


_model: FallDetector | None = None


def get_model() -> FallDetector:
    global _model
    if _model is None:
        _model = FallDetector()
    return _model
