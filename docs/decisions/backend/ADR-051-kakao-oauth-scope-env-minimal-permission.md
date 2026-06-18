# ADR-051: Kakao OAuth scope is env-driven with a minimal `talk_message` default

- Status: Accepted
- Date: 2026-06-18
- Refs: #226; deep-interview spec `.gjc/specs/deep-interview-kakao-fall-alert-delivery.md`; ralplan `2026-06-18-0708-af1a`

## Context
`KakaoClient.buildAuthorizeUrl` hardcoded `scope: 'talk_message profile_nickname'`. When the
Kakao app's `profile_nickname` consent item is not activated for a (test) user, the authorize
request fails with `invalid_scope`, blocking the entire OAuth login → token-storage → send-to-me
flow. The eldercare alert flow only requires `talk_message` to deliver send-to-me messages.

## Decision
Resolve scopes from a `KAKAO_SCOPES` environment value (space/comma separated, normalized and
deduplicated, malformed tokens rejected). When unset or blank, default to exactly `talk_message`
and do **not** request `profile_nickname`. `AuthService` records the persisted `tokenScope` from
the actual Kakao token response when present, otherwise the effective configured scope — never the
old broad `'talk_message profile_nickname'` literal.

## Decision Drivers
- Stop `invalid_scope` at authorize-URL construction rather than working around it later.
- Least privilege: request only what send-to-me needs.
- Honest audit metadata: stored `tokenScope` reflects the real granted/configured scope.

## Alternatives Considered
- Keep the hardcoded `talk_message profile_nickname` and require console consent setup — preserves
  the known failure mode and exceeds the messaging need.
- Omit the `scope` param entirely — opaque, console-coupled, not provably minimal.

## Consequences
- Display nickname falls back to `Kakao User` when `profile_nickname` is not granted (send-to-me
  delivery is unaffected).
- Extra scopes are an explicit, operator-approved opt-in via `KAKAO_SCOPES`; malformed values are
  rejected at runtime.

## Follow-ups
- Add a scope allowlist/validation if more scopes are introduced.
