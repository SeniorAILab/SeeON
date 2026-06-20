"""Compatibility shim for the live HMAC alert ingest client.

The implementation moved to events.publisher/signing/schemas. Imports from
core.alert_client keep the demo REAL /ingest/alerts path unchanged.
"""

from __future__ import annotations

from events.publisher import (
    ALERT_API_URL_ENV,
    ALERT_EVENT_TYPES,
    DEFAULT_QUEUE_SIZE,
    DEFAULT_TIMEOUT_SEC,
    DEMO_FACILITY_ID_ENV,
    DEMO_RESIDENT_ID_ENV,
    INGEST_KEY_ID_ENV,
    INGEST_SECRET_ENV,
    AlertClient,
    _parse_http_url,
    _parse_payload,
    _post_payload,
)
from events.schemas import AlertEventType, AlertPayload
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
    "ALERT_API_URL_ENV",
    "ALERT_EVENT_TYPES",
    "DEFAULT_QUEUE_SIZE",
    "DEFAULT_TIMEOUT_SEC",
    "DEMO_FACILITY_ID_ENV",
    "DEMO_RESIDENT_ID_ENV",
    "INGEST_KEY_ID_ENV",
    "INGEST_SECRET_ENV",
    "ISO_TIMESTAMP_RE",
    "AlertClient",
    "AlertEventType",
    "AlertPayload",
    "_canonical_payload",
    "_derive_hmac_key",
    "_ingest_timestamp",
    "_is_iso_timestamp",
    "_parse_http_url",
    "_parse_payload",
    "_parse_required_value",
    "_post_payload",
    "_signature",
]
