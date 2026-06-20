"""HMAC signing helpers for ML alert/event emission.

ML emits typed signed events. Backend owns severity/channel/policy/final-dedup;
ML runtime incident management owns only idempotency and cooldown.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import re
from typing import Final

from events.schemas import AlertPayload

ISO_TIMESTAMP_RE: Final = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$"
)


def _parse_required_value(value: str, name: str) -> str:
    stripped = value.strip()
    if stripped == "":
        raise ValueError(f"Alert ingest {name} must be set")
    return stripped


def _derive_hmac_key(ingest_secret: str) -> str:
    secret = _parse_required_value(ingest_secret, "ingest_secret")
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _is_iso_timestamp(value: str) -> bool:
    return ISO_TIMESTAMP_RE.fullmatch(value) is not None


def _canonical_payload(payload: AlertPayload) -> str:
    return f"{payload.resident_id}|{payload.facility_id}|{payload.type}|{payload.detected_at}"


def _signature(payload: AlertPayload, *, signing_key: str) -> str:
    return hmac.new(
        signing_key.encode("utf-8"),
        _canonical_payload(payload).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _ingest_timestamp() -> str:
    return dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")


__all__ = [
    "ISO_TIMESTAMP_RE",
    "_canonical_payload",
    "_derive_hmac_key",
    "_ingest_timestamp",
    "_is_iso_timestamp",
    "_parse_required_value",
    "_signature",
]
