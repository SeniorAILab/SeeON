# Domains Agent Rules

Own worker domain detectors and the `DOMAIN_REGISTRY`.

## Local Ownership

- `base.py`: `DomainDetector` interface.
- `__init__.py`: `DomainRegistration`, enabled-domain helpers, and registry wiring.
- `fall/`, `bed_exit/`: enabled domain implementations.
- `long_lie/`, `risk/`, `wheelchair_standup/`: scaffolded disabled detectors.

## Imports

Allowed: `contracts`, `features`, `worker/perception`, and local `worker/domains`.

Forbidden: `worker/sources`, `worker/runners`, `worker` orchestration, `events`, `api`, `demo`, `training`.

## Focused Tests

- `tests/test_domains_fall.py`
- `tests/test_domains_bed_exit.py`
- `tests/test_domain_registry_scaffolds_disabled.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

`worker/domains` must not import worker orchestration. Worker orchestration owns scheduling and camera identity; domains own observation-to-event interpretation only.
