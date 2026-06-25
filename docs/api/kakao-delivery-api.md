# Kakao Delivery API

Kakao delivery is backend-owned outbox/delivery state, not a separate alert ingress. Dashboard/history success and Kakao delivery availability are reported separately.

## Ownership

- `/ingest/alerts` creates the dashboard alert read-model and calls `AlertEventsService.ensureOutboxForIngest`.
- `AlertEvent` records the durable delivery-domain event keyed by `(sourceId, externalEventId)`.
- `DeliveryAttempt` records per-channel, per-recipient delivery state.
- `DeliveryChannel.KAKAO_SEND_TO_ME` is the current Kakao channel.
- Kakao delivery never determines whether an alert exists in dashboard history.

## Outbox creation

For ingest-created alerts, `ensureOutboxForIngest` builds an `AlertEventRequestDto`:

```json
{
  "type": "fall",
  "source_id": "camera_cuid",
  "external_event_id": "server_derived_idempotency_key",
  "detected_at": "2026-06-18T12:00:00.000Z",
  "confidence": 0.97
}
```

The repository creates or reuses the `AlertEvent` by unique `(sourceId, externalEventId)`.

Duplicate-repair semantics:

- Existing `AlertEvent` means duplicate outbox event, not failure.
- Per-recipient `DeliveryAttempt` rows are upserted for current recipients.
- Existing attempts with non-pending status are not resent.
- Only `PENDING` attempts are dispatched.

## Recipient fan-out

`findKakaoRecipients(facilityId)` selects facility users with a stored encrypted Kakao token:

- `User.facilityId == alert facilityId`
- `KakaoIdentity.accessTokenCipher != null`

The target fan-out is per user: each eligible facility user gets one `DeliveryAttempt` with `recipientUserId` and channel `KAKAO_SEND_TO_ME`.

Missing token means no recipient attempt for that user. It is delivery `UNAVAILABLE` for Kakao, not dashboard failure, and must not be reported as sent.

## Token handling

Kakao access tokens are encrypted at rest (`KakaoIdentity.accessTokenCipher`) under ADR-071. Delivery decrypts the recipient token immediately before send.

Terminal operator-action failures include:

- token expired (`kakao_access_token_expired`)
- token decrypt failure
- missing/invalid Kakao config or token data
- Kakao 4xx responses indicating app/channel/scope/template/operator action is required

These failures are stored on `DeliveryAttempt` and require operator or user action before retry.

## Send-to-me channel

`KakaoSendToMeChannelAdapter` sends to Kakao's memo endpoint:

```text
https://kapi.kakao.com/v2/api/talk/memo/default/send
```

The request uses:

- `Authorization: Bearer <recipient access token>`
- `Content-Type: application/x-www-form-urlencoded;charset=utf-8`
- `template_object=<json text template>`

The template includes alert type, source id, external event id, detected time, optional confidence, and a link to the configured dashboard URL.

Success result:

```json
{
  "kind": "sent",
  "provider_reference": "kakao-send-to-me"
}
```

Failure result:

```json
{
  "kind": "failed",
  "failure_class": "transient",
  "reason": "kakao_http_500",
  "retry_after_ms": 60000
}
```

or:

```json
{
  "kind": "failed",
  "failure_class": "terminal_operator_action",
  "reason": "kakao_http_401",
  "operator_action": "Inspect Kakao app/channel permissions, token scope, and request template."
}
```

## DeliveryAttempt state transitions

`recordDeliveryResult` maps channel results to durable states:

| Result                            | DeliveryAttempt status | Stored failure class       | Retry                                                 |
| --------------------------------- | ---------------------- | -------------------------- | ----------------------------------------------------- |
| `sent`                            | `SENT`                 | none                       | no retry                                              |
| `failed/transient`                | `RETRY_SCHEDULED`      | `TRANSIENT`                | `nextAttemptAt = now + retry_after_ms` or default 60s |
| `failed/terminal_operator_action` | `TERMINAL_FAILED`      | `TERMINAL_OPERATOR_ACTION` | no automatic retry                                    |

Every recorded result increments `attemptCount`. Sent attempts store `sentAt` and `providerReference` and clear previous failure fields.

## Availability reporting rule

Kakao delivery availability must be labeled independently from alert ingest/dashboard success:

- Alert persisted and visible in dashboard/history: report dashboard/history success.
- Real Kakao send succeeds with a real token and Kakao response: report Kakao delivery success.
- Missing Kakao token, missing Kakao credentials/config, expired token, decrypt failure, unavailable network, or Kakao operator-action failure: report Kakao delivery `UNAVAILABLE` or failed with the concrete stored reason.

Never fake Kakao success. A fallback path may keep the dashboard usable, but it must not mark Kakao delivery as sent unless Kakao actually accepted the send-to-me request.
