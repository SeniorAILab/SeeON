from __future__ import annotations

from dataclasses import dataclass, field


def _event_value(event: object, name: str, default: object = None) -> object:
    if isinstance(event, dict):
        return event.get(name, default)
    return getattr(event, name, default)


@dataclass(slots=True)
class IncidentManager:
    """Idempotency and cooldown gate for emitted incident events.

    This class deliberately does not assign severity, apply policy, route events,
    or fan out notifications. It only answers whether an event is new enough to
    emit.
    """

    cooldown_sec: float = 30.0
    bucket_sec: float | None = None
    _last_seen: dict[tuple[object, ...], float] = field(default_factory=dict, init=False)

    def admit(self, event: object, *, now_sec: float | None = None) -> bool:
        event_time = _coerce_time(now_sec, _event_value(event, "time_sec", 0.0))
        key = self.idempotency_key(event, event_time)
        last_seen = self._last_seen.get(key)
        if last_seen is not None and event_time - last_seen < self.cooldown_sec:
            return False
        self._last_seen[key] = event_time
        return True

    def register(self, event: object, *, now_sec: float | None = None) -> bool:
        return self.admit(event, now_sec=now_sec)

    def idempotency_key(self, event: object, event_time: float) -> tuple[object, ...]:
        explicit_key = _event_value(event, "idempotency_key")
        if explicit_key is not None:
            return (explicit_key,)

        bucket: int | None = None
        if self.bucket_sec is not None and self.bucket_sec > 0:
            bucket = int(event_time // self.bucket_sec)

        return (
            _event_value(event, "camera_id"),
            _event_value(event, "domain"),
            _event_value(event, "event_type", _event_value(event, "type")),
            _event_value(event, "identity", _event_value(event, "event_id", bucket)),
        )

    def reset(self) -> None:
        self._last_seen.clear()


def _coerce_time(now_sec: float | None, event_time: object) -> float:
    if now_sec is not None:
        return float(now_sec)
    if isinstance(event_time, int | float):
        return float(event_time)
    return 0.0
