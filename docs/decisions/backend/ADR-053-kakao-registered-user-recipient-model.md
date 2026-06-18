# ADR-053: Kakao alerts deliver to registered-user per-user send-to-me recipients

- Status: Accepted
- Date: 2026-06-18
- Refs: #226, ADR-044 (send-to-me multi-recipient fan-out); deep-interview spec `.gjc/specs/deep-interview-kakao-fall-alert-delivery.md`

## Context
Kakao `memo/default/send` ("send-to-me") delivers only to the account that authorized the
access token. The alert message now carries resident PII (name, room), so the recipient set is a
privacy-sensitive decision. `AlertEventsService.findKakaoRecipients(orgId)` returns every org user
with a stored Kakao token; the deep-interview goal phrased delivery as reaching "원장 본인".

## Decision
Preserve the existing registered-user fan-out: recipients are org users with a stored, encrypted
Kakao token, reached via `AlertEvent → DeliveryAttempt(recipientUserId) → KakaoSendToMeChannelAdapter`.
No REST-key direct send, hardcoded recipient token, or phone-number routing. The PII recipient set
is made intentional and asserted by tests. In the MVP demo only the director (OWNER) is bound via
`demo:bind`, so the effective recipient is 원장 본인.

## Decision Drivers
- Kakao send-to-me reality: only the per-user OAuth token can reach that user's KakaoTalk.
- Auditability via existing `DeliveryAttempt` rows; no bypass path.
- Consistency with ADR-044 (multi-recipient fan-out already a product decision).

## Alternatives Considered
- OWNER-only filter — narrower, but diverges from ADR-044; revisit if multi-user orgs onboard.
- App REST-key direct send / hardcoded owner token / phone-number routing — impossible for
  send-to-me and/or a security regression.

## Consequences
- Any additional org user with a Kakao token receives the PII-bearing message; this boundary is
  explicit and test-asserted. Per-recipient isolation means one failure does not block others.
- Expired/again-undecryptable tokens are recorded as terminal failures without sending; refresh
  requires re-consent (refresh-token storage is out of scope).

## Follow-ups
- Per-resident/guardian-scoped recipient policy or an OWNER-only toggle if finer control is needed.
