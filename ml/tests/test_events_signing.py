from __future__ import annotations

import hashlib
import hmac

from events.publisher import _signature as shim_signature
from events.schemas import AlertPayload
from events.signing import _canonical_payload, _derive_hmac_key, _is_iso_timestamp, _signature


def test_signature_is_deterministic_and_matches_prior_alert_client_canonical_hmac() -> None:
    payload = AlertPayload(
        type="fall",
        resident_id="resident-001",
        facility_id="facility-001",
        detected_at="2026-06-13T12:00:00.000Z",
        probability=0.87,
    )
    signing_key = _derive_hmac_key("raw-demo-secret")
    expected = hmac.new(
        hashlib.sha256(b"raw-demo-secret").hexdigest().encode("utf-8"),
        b"resident-001|facility-001|fall|2026-06-13T12:00:00.000Z",
        hashlib.sha256,
    ).hexdigest()

    assert _canonical_payload(payload) == (
        "resident-001|facility-001|fall|2026-06-13T12:00:00.000Z"
    )
    assert _signature(payload, signing_key=signing_key) == expected
    assert _signature(payload, signing_key=signing_key) == shim_signature(
        payload, signing_key=signing_key
    )


def test_signature_includes_bed_exit_type_in_canonical_payload() -> None:
    payload = AlertPayload(
        type="bed-exit",
        resident_id="resident-001",
        facility_id="facility-001",
        detected_at="2026-06-13T12:00:00.000Z",
        probability=1.0,
    )
    signing_key = _derive_hmac_key("raw-demo-secret")

    assert _canonical_payload(payload) == (
        "resident-001|facility-001|bed-exit|2026-06-13T12:00:00.000Z"
    )
    assert _signature(payload, signing_key=signing_key) == shim_signature(
        payload, signing_key=signing_key
    )


def test_iso_timestamp_validation_accepts_ingest_format_and_rejects_invalid_values() -> None:
    assert _is_iso_timestamp("2026-06-13T12:00:00.000Z")
    assert _is_iso_timestamp("2026-06-13T12:00:00+09:00")
    assert not _is_iso_timestamp("2026-06-13 12:00:00")
