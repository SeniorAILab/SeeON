"""Strict random-forest artifact loader for serving."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


class ModelLoadError(RuntimeError):
    """Raised when the serving model artifact is absent or invalid."""


@dataclass(frozen=True, slots=True)
class ModelMetadata:
    model_type: str
    framework: str
    window: int
    stride: int
    feature_dim: int
    name: str
    version: str
    operating_threshold: float | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ModelMetadata":
        required = ("model_type", "framework", "window", "stride", "feature_dim", "name", "version")
        missing = [key for key in required if key not in data]
        if missing:
            raise ModelLoadError(f"metadata.json missing required fields: {', '.join(missing)}")
        if data["model_type"] != "random-forest":
            raise ModelLoadError(f"unsupported model_type {data['model_type']!r}")
        if data["framework"] != "sklearn":
            raise ModelLoadError(f"unsupported framework {data['framework']!r}")
        try:
            window = int(data["window"])
            stride = int(data["stride"])
            feature_dim = int(data["feature_dim"])
        except (TypeError, ValueError) as exc:
            raise ModelLoadError("metadata window, stride, and feature_dim must be integers") from exc
        if window <= 0 or stride <= 0 or feature_dim <= 0:
            raise ModelLoadError("metadata window, stride, and feature_dim must be positive")
        threshold = data.get("operating_threshold")
        return cls(
            model_type=data["model_type"],
            framework=data["framework"],
            window=window,
            stride=stride,
            feature_dim=feature_dim,
            name=str(data["name"]),
            version=str(data["version"]),
            operating_threshold=None if threshold is None else float(threshold),
        )

    def asdict(self) -> dict[str, Any]:
        return {
            "model_type": self.model_type,
            "framework": self.framework,
            "window": self.window,
            "stride": self.stride,
            "feature_dim": self.feature_dim,
            "name": self.name,
            "version": self.version,
            "operating_threshold": self.operating_threshold,
        }


class FallDetector:
    def __init__(self, model_type: str = "random-forest", models_dir: Path = MODELS_DIR) -> None:
        if model_type != "random-forest":
            raise ModelLoadError(f"unsupported model_type {model_type!r}")
        self.model_type = model_type
        self.artifact_dir = models_dir / "fall" / model_type
        self.model_path = self.artifact_dir / "model.pkl"
        self.metadata_path = self.artifact_dir / "metadata.json"
        self.metadata = self._load_metadata()
        self.model = self._load_model()
        self._validate_model_shape()

    @property
    def name(self) -> str:
        return self.metadata.name

    @property
    def version(self) -> str:
        return self.metadata.version

    def _load_metadata(self) -> ModelMetadata:
        if not self.metadata_path.exists():
            raise ModelLoadError(f"missing metadata.json at {self.metadata_path}")
        try:
            data = json.loads(self.metadata_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise ModelLoadError(f"cannot read metadata.json: {exc}") from exc
        if not isinstance(data, dict):
            raise ModelLoadError("metadata.json must contain an object")
        return ModelMetadata.from_dict(data)

    def _load_model(self) -> Any:
        if not self.model_path.exists():
            raise ModelLoadError(f"missing model.pkl at {self.model_path}")
        try:
            import joblib

            return joblib.load(self.model_path)
        except Exception as exc:  # noqa: BLE001 - boundary converts artifact errors to explicit load failure
            raise ModelLoadError(f"cannot load model.pkl: {exc}") from exc

    def _validate_model_shape(self) -> None:
        n_features = getattr(self.model, "n_features_in_", None)
        if n_features is not None and int(n_features) != self.metadata.feature_dim:
            raise ModelLoadError(
                f"model feature_dim mismatch: metadata={self.metadata.feature_dim} artifact={n_features}"
            )
        if not hasattr(self.model, "predict_proba"):
            raise ModelLoadError("model.pkl must expose predict_proba")

    def predict(self, features: list[float] | np.ndarray) -> float:
        arr = np.asarray(features, dtype=np.float32).reshape(1, -1)
        if arr.shape[1] != self.metadata.feature_dim:
            raise ValueError(
                f"expected {self.metadata.feature_dim} features, received {arr.shape[1]}"
            )
        proba = self.model.predict_proba(arr)
        return float(np.clip(proba[0, 1], 0.0, 1.0))


_model: FallDetector | None = None


def get_model() -> FallDetector:
    global _model
    if _model is None:
        _model = FallDetector()
    return _model


def reset_model_cache() -> None:
    global _model
    _model = None
