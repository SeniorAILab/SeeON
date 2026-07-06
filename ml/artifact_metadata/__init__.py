"""Model artifact metadata schema -- read-side contract for the live demo.

Training now lives in eldercare-dataset-ops (ADR-0004): that repo's
``training/train.py`` writes ``metadata.json``, ``evaluate.py`` updates
``operating_threshold``, and both import this exact schema from their own
vendored copy. fall-ai keeps only the read side here, because the live demo
temporal adapter (``demo/temporal_module.py``, ``demo/thresholds.py``) still
needs to load ``metadata.json`` out of ``ml/models/fall/*`` at runtime.

Deliberately self-contained (no ``training.*`` import): fall-ai no longer
carries a training package, so ``ARTIFACT_BASE`` and
``DEFAULT_OPERATING_THRESHOLD`` are duplicated here rather than imported.
Keep this schema byte-for-byte in sync with eldercare-dataset-ops's
``training/metadata.py`` -- see ``tests/test_vendor_drift.py``.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields
from pathlib import Path

# --- Paths (anchored at the ml/ project root) ---
_ML_ROOT = Path(__file__).resolve().parent.parent  # -> ml/
ARTIFACT_BASE = _ML_ROOT / "models" / "fall"

# Default operating threshold persisted into metadata until dataset-ops's
# evaluate.py picks the validated Recall>=0.90 point; the live adapter reads
# it back from metadata.json, never from this constant, once a real artifact
# exists.
DEFAULT_OPERATING_THRESHOLD = 0.5

METADATA_FILENAME = "metadata.json"

# Canonical per-model serialized weight filename by framework.
MODEL_FILENAME = {"sklearn": "model.pkl", "pytorch": "model.pt"}

# Model-family keys the demo can enumerate. Plain tuple, not a dispatch table:
# InProcessFallClassifier (demo/temporal_module.py) always loads inference
# through worker.runners.sklearn_fall.FallDetector regardless of key, so
# nothing in fall-ai needs to import a per-family model class anymore. Class
# dispatch by key (module/class_name) lives only in dataset-ops's
# training.models.catalog.CATALOG now.
CATALOG: tuple[str, ...] = (
    "random-forest",
    "svm",
    "logistic-regression",
    "lstm",
    "transformer",
    "gcn",
)


@dataclass(frozen=True, slots=True)
class ModelMetadata:
    """Schema for a trained fall-classifier artifact.

    ``input_shape`` is ``[T, 51]`` for sequence nets and ``None`` for RF;
    ``feature_dim`` is ``D`` for RF and ``None`` for nets. ``window``/``stride``
    are always present so the live adapter can buffer frames identically to
    training. ``operating_threshold`` starts at the default and is overwritten
    by dataset-ops's evaluate.py with the validated Recall>=0.90 point.
    """

    model_type: str  # "random-forest" | "lstm" | "transformer"
    framework: str  # "sklearn" | "pytorch"
    window: int  # T
    stride: int
    input_shape: list[int] | None  # [T, 51] for nets, None for RF
    feature_dim: int | None  # D for RF, None for nets
    seed: int
    classes: tuple[int, ...] = (0, 1)
    operating_threshold: float = DEFAULT_OPERATING_THRESHOLD
    # AC-6 contract keys (constant for this PoC; defaults keep older
    # metadata.json files loadable without migration).
    name: str = "fall-detector"
    version: str = "poc"
    dataset: str = "le2i"
    outputs: tuple[str, ...] = ("fall_prob",)
    # ADR layout contract: every artifact must declare provenance and a
    # non-empty reacquisition command (enforced by test_models_layout).
    source: str = "trained"
    reacquire: str = "cd ../eldercare-dataset-ops/ml && uv run python -m training.train"


def artifact_dir(model_type: str, base: Path = ARTIFACT_BASE) -> Path:
    """Resolve the artifact directory for a model key (``base/{model_type}``)."""
    return base / model_type


def save_metadata(directory: Path, meta: ModelMetadata) -> Path:
    """Write ``metadata.json`` into ``directory`` (created if missing).

    fall-ai's own tests use this to build synthetic artifacts under
    ``tmp_path``; production artifacts are written by dataset-ops.
    """
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / METADATA_FILENAME
    path.write_text(json.dumps(asdict(meta), indent=2), encoding="utf-8")
    return path


def load_metadata(directory: Path) -> ModelMetadata:
    """Read ``metadata.json`` from ``directory`` into a ``ModelMetadata``.

    Unknown keys are dropped instead of raising, so a reader running an older
    schema can still load a newer metadata.json (and vice versa via the
    dataclass defaults) — schema skew must never crash the live demo.
    """
    raw = json.loads((directory / METADATA_FILENAME).read_text(encoding="utf-8"))
    raw["classes"] = tuple(raw.get("classes", (0, 1)))
    raw["outputs"] = tuple(raw.get("outputs", ("fall_prob",)))
    known = {f.name for f in fields(ModelMetadata)}
    return ModelMetadata(**{k: v for k, v in raw.items() if k in known})
