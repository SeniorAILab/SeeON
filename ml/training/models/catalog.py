"""Declarative model-family catalog — the single source of truth.

CATALOG maps each model key to where its class lives and how its artifact is
shaped, WITHOUT importing the class. This module must stay import-light
(stdlib only): the Streamlit demo imports it at module level to enumerate
families and probe artifact availability before torch/sklearn are loaded.

Consumers:
- ``training.models.REGISTRY`` is built from CATALOG (imports the classes).
- ``demo.temporal_module`` derives its key set / modes from CATALOG and
  imports a class lazily only when a model is actually built.

Adding a new model family = one CATALOG entry (plus the factory module).
"""

from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
from typing import Any


@dataclass(frozen=True, slots=True)
class ModelEntry:
    module: str  # import path of the factory module
    class_name: str  # FallClassifier class inside ``module``
    mode: str  # "features" (flat [N, D]) | "sequence" ([N, T, 51])
    artifact_filename: str  # file written by factory.save()


CATALOG: dict[str, ModelEntry] = {
    "random-forest": ModelEntry(
        module="training.models.rf",
        class_name="RandomForestFallClassifier",
        mode="features",
        artifact_filename="model.pkl",
    ),
    "svm": ModelEntry(
        module="training.models.svm",
        class_name="SvmFallClassifier",
        mode="features",
        artifact_filename="model.pkl",
    ),
    "logistic-regression": ModelEntry(
        module="training.models.logreg",
        class_name="LogisticRegressionFallClassifier",
        mode="features",
        artifact_filename="model.pkl",
    ),
    "lstm": ModelEntry(
        module="training.models.lstm",
        class_name="LstmFallClassifier",
        mode="sequence",
        artifact_filename="model.pt",
    ),
    "transformer": ModelEntry(
        module="training.models.transformer",
        class_name="TransformerFallClassifier",
        mode="sequence",
        artifact_filename="model.pt",
    ),
    "gcn": ModelEntry(
        module="training.models.gcn",
        class_name="GcnFallClassifier",
        mode="sequence",
        artifact_filename="model.pt",
    ),
}


def load_model_class(key: str) -> Any:
    """Import and return the FallClassifier class for *key* (heavy import)."""
    entry = CATALOG[key]
    return getattr(import_module(entry.module), entry.class_name)
