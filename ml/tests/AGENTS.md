# Tests Agent Rules

Own pytest coverage for the ML uv project, including dependency-boundary guards and fixtures.

## Local Ownership

- `test_import_dependency_ladder.py`: executable import-ladder contract.
- `edge_worker_fixtures.py`, `demo_app_control_helpers.py`: shared test helpers.
- `test_*`: package-specific and cross-boundary tests.

## Imports

Allowed: any production package needed by the test under coverage, pytest helpers, and local fixtures.

Forbidden: importing private generated data/model artifacts as required test inputs, relying on camera hardware, network services, or uncommitted local files for default tests.

## Commands

```bash
uv run --directory ml pytest tests/test_import_dependency_ladder.py
```

## Gotchas

Keep boundary tests small and explicit. When import policy changes, update `test_import_dependency_ladder.py` and the relevant AGENTS files in the same change.
