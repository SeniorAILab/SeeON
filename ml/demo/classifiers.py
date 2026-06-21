from __future__ import annotations

from dataclasses import dataclass

from demo.temporal_module import TEMPORAL_MODEL_KEYS, temporal_artifact_available


@dataclass(frozen=True, slots=True)
class ClassifierParams:
    confidence: float = 0.05  # pose conf passthrough (used by module, kept here for UI)
    window: int = 60  # frames (reserved for temporal models)
    stride: int = 15  # frames (reserved)


@dataclass(frozen=True, slots=True)
class ClassifierSpec:
    key: str
    display_name: str
    available: bool
    factory: object | None


# Human-readable names for known families; unseen catalog keys fall back to a
# mechanical title-case so a brand-new family still renders without demo edits.
_DISPLAY_NAMES: dict[str, str] = {
    "random_forest": "Random Forest",
    "svm": "SVM",
    "logistic_regression": "Logistic Regression",
    "lstm": "LSTM",
    "transformer": "Transformer",
    "gcn": "GCN (ST-GCN)",
}


def _temporal_spec(key: str) -> ClassifierSpec:
    available = temporal_artifact_available(key)
    name = _DISPLAY_NAMES.get(key, key.replace("_", " ").title())
    return ClassifierSpec(
        key=key,
        display_name=name if available else f"{name} (준비중)",
        available=available,
        factory=None,
    )


# Temporal entries derive from the training model catalog (TEMPORAL_MODEL_KEYS):
# every family with a trained artifact on disk is exposed automatically.
# Availability is evaluated once at import time; a fresh Streamlit run (app
# restart) re-evaluates it, so models auto-light-up after training.
CLASSIFIER_REGISTRY: tuple[ClassifierSpec, ...] = tuple(
    _temporal_spec(key) for key in TEMPORAL_MODEL_KEYS
)


def available_classifier_keys() -> tuple[str, ...]:
    """Return keys for all classifiers that are currently available."""
    return tuple(spec.key for spec in CLASSIFIER_REGISTRY if spec.available)
