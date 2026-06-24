"""L4 event emission package.

ML emits typed signed events. Backend owns severity/channel/policy/final-dedup;
ML runtime incident management owns only idempotency and cooldown.
"""

from events.local_publisher import EventPublisher, LoggingEventPublisher, StubEventPublisher
from events.outbox import Outbox
from events.schemas import (
    AlertEventType,
    AlertPayload,
    EmittedEvent,
    EventLifecycle,
    build_emitted_event,
)
from events.signing import (
    ISO_TIMESTAMP_RE,
    _canonical_payload,
    _derive_hmac_key,
    _ingest_timestamp,
    _is_iso_timestamp,
    _parse_required_value,
    _signature,
)

__all__ = [
    "AlertClient",
    "AlertEventType",
    "AlertPayload",
    "EmittedEvent",
    "EventLifecycle",
    "EventPublisher",
    "ISO_TIMESTAMP_RE",
    "LoggingEventPublisher",
    "Outbox",
    "StubEventPublisher",
    "_canonical_payload",
    "_derive_hmac_key",
    "_ingest_timestamp",
    "_is_iso_timestamp",
    "_parse_required_value",
    "_signature",
    "build_emitted_event",
]


def __getattr__(name: str) -> type:
    if name == "AlertClient":
        from events.publisher import AlertClient

        return AlertClient
    raise AttributeError(name)
