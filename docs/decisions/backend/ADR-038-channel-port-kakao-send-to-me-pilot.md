# ADR-038: ChannelPort with Kakao send-to-me pilot and AlimTalk-ready boundary

## Status
Accepted

## Date
2026-06-13

## Context

Kakao Developers send-to-me proved that real Kakao delivery works for the pilot, but it is not the right production notification surface for caregiver alerts. Production Kakao notifications usually require Kakao Business/AlimTalk provider/dealer setup, template approval, and operational delivery rules. The code must preserve pilot evidence without baking send-to-me semantics into the domain use case.

## Decision

Introduce a provider-neutral `ChannelPort` and keep Kakao Developers send-to-me behind a pilot adapter.

The port returns a provider-neutral delivery result:

- `sent` with an optional provider reference.
- `failed` with `transient` for timeout, network, provider 5xx, and rate-limit style retryable failures.
- `failed` with `terminal_operator_action` for provider 4xx, missing config, invalid token file, or permission/template problems.

The domain service records the result in `DeliveryAttempt`; it does not depend on Kakao-specific response bodies. Future AlimTalk/SMS adapters must map provider responses into the same result semantics. The pilot adapter reads its access token from `KAKAO_TOKEN_PATH`; the standalone `backend/scripts/kakao-auth.ts` OAuth bootstrap produces that token file.

## Alternatives Considered

### Hard-code Kakao send-to-me into the alert use case
- Pros: smallest implementation.
- Cons: makes pilot provider details part of the domain API and blocks clean AlimTalk migration.
- Rejected: provider portability is a structural requirement.

### Implement AlimTalk immediately
- Pros: closest to production delivery channel.
- Cons: needs business channel, templates, provider/dealer contract, and lead time outside this code slice.
- Deferred: adapter boundary is in scope; provider onboarding is not.

### Treat all Kakao failures as retryable
- Pros: fewer failure branches.
- Cons: invalid tokens/config or 4xx permission failures would retry forever and hide operator action.
- Rejected: failures need explicit transient vs terminal semantics.

## Consequences

- No automated test performs a real Kakao send; tests use mocks/classification.
- Logs and persisted errors must not contain raw access tokens, refresh tokens, bearer headers, OAuth codes, or client-id-bearing authorization URLs.
- Existing real send-to-me receipt evidence can be reused in PR notes while production provider setup remains a follow-up.
