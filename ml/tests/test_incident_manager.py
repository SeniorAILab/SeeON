from __future__ import annotations

from worker.incident_manager import IncidentManager


def test_incident_manager_dedupes_duplicate_idempotency_key() -> None:
    manager = IncidentManager(cooldown_sec=10)
    event = {"idempotency_key": "cam-a:fall:1", "time_sec": 1.0}

    assert manager.admit(event)
    assert not manager.admit(event)


def test_incident_manager_suppresses_same_key_within_cooldown_and_readmits_after() -> None:
    manager = IncidentManager(cooldown_sec=5)
    event = {"camera_id": "cam-a", "domain": "fall", "event_type": "fall.detected"}

    assert manager.admit(event, now_sec=10.0)
    assert not manager.admit(event, now_sec=12.0)
    assert manager.admit(event, now_sec=15.0)


def test_incident_manager_admits_distinct_keys() -> None:
    manager = IncidentManager(cooldown_sec=30)

    assert manager.admit({"camera_id": "cam-a", "domain": "fall", "event_type": "fall.detected"})
    assert manager.admit({"camera_id": "cam-b", "domain": "fall", "event_type": "fall.detected"})
    assert manager.admit({"camera_id": "cam-a", "domain": "bed_exit", "event_type": "bed.exit"})
