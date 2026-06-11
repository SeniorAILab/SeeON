"""Fall-classifier model registry.

REGISTRY maps each model key to:
  - ``factory``: the class that implements the FallClassifier Protocol
  - ``mode``: "features" (flat [N, D]) or "sequence" ([N, T, 51])
  - ``artifact_filename``: file name written by factory.save()

Adding a new model family = one REGISTRY entry.  All dispatch points in
train.py and evaluate.py are REGISTRY-driven; no per-key ``if`` branches
anywhere else in the codebase.
"""

from __future__ import annotations

from typing import Any

from training.models.gcn import GcnFallClassifier
from training.models.logreg import LogisticRegressionFallClassifier
from training.models.lstm import LstmFallClassifier
from training.models.rf import RandomForestFallClassifier
from training.models.svm import SvmFallClassifier
from training.models.transformer import TransformerFallClassifier

REGISTRY: dict[str, dict[str, Any]] = {
    "random-forest": {
        "factory": RandomForestFallClassifier,
        "mode": "features",
        "artifact_filename": "model.pkl",
    },
    "svm": {
        "factory": SvmFallClassifier,
        "mode": "features",
        "artifact_filename": "model.pkl",
    },
    "logistic-regression": {
        "factory": LogisticRegressionFallClassifier,
        "mode": "features",
        "artifact_filename": "model.pkl",
    },
    "lstm": {
        "factory": LstmFallClassifier,
        "mode": "sequence",
        "artifact_filename": "model.pt",
    },
    "transformer": {
        "factory": TransformerFallClassifier,
        "mode": "sequence",
        "artifact_filename": "model.pt",
    },
    "gcn": {
        "factory": GcnFallClassifier,
        "mode": "sequence",
        "artifact_filename": "model.pt",
    },
}
