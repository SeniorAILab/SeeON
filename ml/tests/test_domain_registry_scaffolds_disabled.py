from __future__ import annotations

import pytest

from contracts.observation import FrameObservation
from domains import DOMAIN_REGISTRY, enabled_domains, list_domains


def test_registry_contains_enabled_fall_and_bed_exit_only() -> None:
    assert set(list_domains()) == {
        "fall",
        "bed_exit",
        "wheelchair_standup",
        "long_lie",
        "risk",
    }
    assert set(enabled_domains()) == {"fall", "bed_exit"}
    assert set(list_domains(enabled=False)) == {"wheelchair_standup", "long_lie", "risk"}


def test_scaffold_domains_are_disabled_and_do_not_run() -> None:
    observation = FrameObservation()
    for name in ("wheelchair_standup", "long_lie", "risk"):
        registration = DOMAIN_REGISTRY[name]
        detector = registration.factory({"ignored": True})
        assert registration.enabled is False
        assert detector.enabled is False
        with pytest.raises(RuntimeError, match=f"{name} domain is disabled"):
            detector.update(observation, time_sec=0.0)


def test_enabled_domain_factories_are_active() -> None:
    for name in ("fall", "bed_exit"):
        registration = DOMAIN_REGISTRY[name]
        detector = registration.factory()
        assert registration.enabled is True
        assert detector.enabled is True
