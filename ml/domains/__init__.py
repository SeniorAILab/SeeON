from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from domains.bed_exit.detector import BedExitMonitor, NightWindow
from domains.fall.detector import FallEventLatch
from domains.long_lie.detector import LongLieDetector
from domains.risk.detector import RiskDetector
from domains.wheelchair_standup.detector import WheelchairStandupDetector


@dataclass(frozen=True, slots=True)
class DomainRegistration:
    name: str
    factory: Callable[[object | None], object]
    enabled: bool


def _ignore_config(factory: Callable[[], object]) -> Callable[[object | None], object]:
    def _factory(_config: object | None = None) -> object:
        return factory()

    return _factory


def _bed_exit_factory(config: object | None = None) -> BedExitMonitor:
    night_window = None
    if isinstance(config, dict):
        raw_night_window = config.get("night_window")
        if isinstance(raw_night_window, dict):
            night_window = NightWindow(
                start=str(raw_night_window["start"]),
                end=str(raw_night_window["end"]),
                tz=str(raw_night_window["tz"]),
            )
    return BedExitMonitor(night_window=night_window)


DOMAIN_REGISTRY: dict[str, DomainRegistration] = {
    "fall": DomainRegistration("fall", _ignore_config(FallEventLatch), FallEventLatch.enabled),
    "bed_exit": DomainRegistration("bed_exit", _bed_exit_factory, BedExitMonitor.enabled),
    "wheelchair_standup": DomainRegistration(
        "wheelchair_standup",
        _ignore_config(WheelchairStandupDetector),
        WheelchairStandupDetector.enabled,
    ),
    "long_lie": DomainRegistration(
        "long_lie",
        _ignore_config(LongLieDetector),
        LongLieDetector.enabled,
    ),
    "risk": DomainRegistration("risk", _ignore_config(RiskDetector), RiskDetector.enabled),
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
