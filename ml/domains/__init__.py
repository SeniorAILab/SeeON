from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from domains.bed_exit.detector import BedExitMonitor
from domains.fall.detector import FallEventLatch
from domains.long_lie.detector import LongLieDetector
from domains.risk.detector import RiskDetector
from domains.wheelchair_standup.detector import WheelchairStandupDetector


@dataclass(frozen=True, slots=True)
class DomainRegistration:
    name: str
    factory: Callable[[], object]
    enabled: bool


DOMAIN_REGISTRY: dict[str, DomainRegistration] = {
    "fall": DomainRegistration("fall", FallEventLatch, FallEventLatch.enabled),
    "bed_exit": DomainRegistration("bed_exit", BedExitMonitor, BedExitMonitor.enabled),
    "wheelchair_standup": DomainRegistration(
        "wheelchair_standup",
        WheelchairStandupDetector,
        WheelchairStandupDetector.enabled,
    ),
    "long_lie": DomainRegistration("long_lie", LongLieDetector, LongLieDetector.enabled),
    "risk": DomainRegistration("risk", RiskDetector, RiskDetector.enabled),
}


def list_domains(*, enabled: bool | None = None) -> tuple[str, ...]:
    if enabled is None:
        return tuple(DOMAIN_REGISTRY)
    return tuple(
        name for name, registration in DOMAIN_REGISTRY.items() if registration.enabled is enabled
    )


def enabled_domains() -> tuple[str, ...]:
    return list_domains(enabled=True)


__all__ = ["DOMAIN_REGISTRY", "DomainRegistration", "enabled_domains", "list_domains"]
