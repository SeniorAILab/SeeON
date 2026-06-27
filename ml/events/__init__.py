"""L4 event emission package.

ML emits typed events. Backend owns severity/channel/policy/final-dedup;
ML runtime incident management owns only idempotency and cooldown.
"""

from events.local_publisher import EventPublisher, LoggingEventPublisher, StubEventPublisher
from events.outbox import Outbox
from events.schemas import (
    AlertEventType,
    EmittedEvent,
    EventApiPayload,
    EventLifecycle,
    build_emitted_event,
)

__all__ = [
    "AlertClient",
    "AlertEventType",
    "EmittedEvent",
    "EventApiPayload",
    "EventLifecycle",
    "EventPublisher",
    "LoggingEventPublisher",
    "Outbox",
    "StubEventPublisher",
    "build_emitted_event",
]


def __getattr__(name: str) -> type:
    if name == "AlertClient":
        from events.publisher import AlertClient

        return AlertClient
    raise AttributeError(name)
