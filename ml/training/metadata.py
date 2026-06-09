"""Model artifact metadata schema -- the single source of truth shared by the
training pipeline (train.py writes it, evaluate.py updates operating_threshold)
and the live demo temporal adapter (temporal_module.py reads it).

Persisted as ``metadata.json`` alongside the serialized model in each artifact
directory. Centralising the schema here prevents train -> serve skew: the live
adapter never guesses ``window``/``stride``/``operating_threshold`` -- it reads
exactly what training wrote.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from training.config import ARTIFACT_BASE, DEFAULT_OPERATING_THRESHOLD

METADATA_FILENAME = "metadata.json"

# Canonical per-model serialized weight filename by framework.
MODEL_FILENAME = {"sklearn": "model.pkl", "pytorch": "model.pt"}


@dataclass(frozen=True, slots=True)
class ModelMetadata:
    """Schema for a trained fall-classifier artifact.

    ``input_shape`` is ``[T, 51]`` for sequence nets and ``None`` for RF;
    ``feature_dim`` is ``D`` for RF and ``None`` for nets. ``window``/``stride``
    are always present so the live adapter can buffer frames identically to
    training. ``operating_threshold`` starts at the default and is overwritten by
    evaluate.py with the validated Recall>=0.90 point.
    """

    model_type: str  # "random_forest" | "lstm" | "transformer"
    framework: str  # "sklearn" | "pytorch"
    window: int  # T
    stride: int
    input_shape: list[int] | None  # [T, 51] for nets, None for RF
    feature_dim: int | None  # D for RF, None for nets
    seed: int
    classes: tuple[int, ...] = (0, 1)
    operating_threshold: float = DEFAULT_OPERATING_THRESHOLD


def artifact_dir(model_type: str, base: Path = ARTIFACT_BASE) -> Path:
    """Resolve the artifact directory for a model key (``base/{model_type}``)."""
    return base / model_type


def save_metadata(directory: Path, meta: ModelMetadata) -> Path:
    """Write ``metadata.json`` into ``directory`` (created if missing)."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / METADATA_FILENAME
    path.write_text(json.dumps(asdict(meta), indent=2), encoding="utf-8")
    return path


def load_metadata(directory: Path) -> ModelMetadata:
    """Read ``metadata.json`` from ``directory`` into a ``ModelMetadata``."""
    raw = json.loads((directory / METADATA_FILENAME).read_text(encoding="utf-8"))
    raw["classes"] = tuple(raw.get("classes", (0, 1)))
    return ModelMetadata(**raw)
