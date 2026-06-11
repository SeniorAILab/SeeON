"""Fall-classifier model registry.

REGISTRY maps each model key to:
  - ``factory``: the class that implements the FallClassifier Protocol
  - ``mode``: "features" (flat [N, D]) or "sequence" ([N, T, 51])
  - ``artifact_filename``: file name written by factory.save()

REGISTRY is built from ``training.models.catalog.CATALOG`` — the import-light
single source of truth that the demo also reads. Adding a new model family =
one CATALOG entry. All dispatch points in train.py and evaluate.py are
REGISTRY-driven; no per-key ``if`` branches anywhere else in the codebase.

Importing this module imports every factory class (torch/sklearn). Callers
that only need keys/modes without the heavy deps import the catalog instead.
"""

from __future__ import annotations

from typing import Any

from training.models.catalog import CATALOG, load_model_class

REGISTRY: dict[str, dict[str, Any]] = {
    key: {
        "factory": load_model_class(key),
        "mode": entry.mode,
        "artifact_filename": entry.artifact_filename,
    }
    for key, entry in CATALOG.items()
}
