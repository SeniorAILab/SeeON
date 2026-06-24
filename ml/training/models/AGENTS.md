# Training Models Agent Rules

Own trainable fall-classifier model classes and the training model catalog.

## Local Ownership

- `base.py`: shared classifier interfaces and torch base class.
- `catalog.py`, `__init__.py`: model registry/catalog loading.
- `logreg.py`, `rf.py`, `svm.py`: sklearn models.
- `gcn.py`, `lstm.py`, `transformer.py`: torch models.

## Imports

Allowed: `training.config`, `training.hp`, local `training.models`, sklearn, torch, numpy.

Forbidden: `sources`, `runners`, `perception`, `domains`, `runtime`, `events`, `serving`, `demo`.

## Focused Tests

- `tests/test_training_models.py`
- `tests/test_hp_wiring.py`
- `tests/test_demo_registry_catalog.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Catalog keys are used by demo model selection and training metadata. Keep key changes backward-compatible or update metadata fixtures and registry tests together.
