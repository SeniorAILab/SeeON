# ADR-044: Kakao send-to-me multi-recipient fan-out

## Status
Accepted

## Date
2026-06-17

## Context

ADR-038 introduced a provider-neutral `ChannelPort` and a Kakao Developers send-to-me pilot adapter. That pilot proved provider delivery, but send-to-me has a hard product constraint: it sends only to the Kakao account that owns the access token.

The domain also has Guardian contact concepts, but Guardians are not necessarily authenticated Users and do not have Kakao OAuth tokens in this build. Sending to non-User Guardian phone numbers requires a Kakao Business channel such as FriendTalk or AlimTalk, template/provider approval, and operational lead time outside the Thursday MVP.

The MVP therefore needs a fan-out definition that works with send-to-me's token-owner semantics and the existing org model.

This ADR extends ADR-038 by defining the pilot fan-out recipient set and per-recipient persistence model.

## Decision

For the Kakao send-to-me pilot, fan-out recipients are the OAuth'd `User` records in the camera's organization that have an encrypted Kakao access token.

For each alert event:

- Resolve the source camera's `orgId`.
- Select token-bearing Users in that org.
- Create one `DeliveryAttempt` per recipient User before sending.
- Store `DeliveryAttempt.recipientUserId` and enforce `@@unique([alertEventId, recipientUserId])`.
- Send each recipient independently using that User's decrypted Kakao token.
- Record each result independently so one recipient's failure does not block the `Alert`, SSE update, or other recipients.
- Classify expired tokens, missing tokens, malformed ciphertext, authentication-tag failure, and decryption failure as `terminal_operator_action` for that recipient.

Resident-linked routing and non-User Guardian delivery are follow-up product decisions, not hidden behavior in the send-to-me pilot.

## Alternatives Considered

### Resident-linked recipient model

- Pros: closer to long-term caregiver routing; can target the right guardians for a resident.
- Cons: needs additional product model decisions, user/guardian association rules, onboarding UX, and migration work.
- Deferred: appropriate follow-up after the MVP proves live fall delivery.

### Kakao Business FriendTalk or AlimTalk for non-User Guardians

- Pros: supports delivery to external caregiver phone numbers rather than only OAuth'd Users.
- Cons: requires Kakao Business channel/provider setup, template review, and approval lead time.
- Out of scope: not viable for the Thursday MVP timeline.

### Keep a single global send-to-me recipient

- Pros: simplest continuation of ADR-038's pilot token-file behavior.
- Cons: cannot deliver to both demo operators and hides per-recipient failure semantics.
- Rejected: the MVP requires multi-recipient fan-out.

## Consequences

- The MVP alert recipient set is org-wide OAuth'd Users with decryptable Kakao access tokens.
- `DeliveryAttempt` becomes per recipient, with `recipientUserId` and a uniqueness constraint on `(alertEventId, recipientUserId)`.
- A bad or expired token creates operator-action work for that recipient only.
- Guardian phone-number delivery remains a future business-channel feature rather than a send-to-me behavior.
- ADR-038 remains the authority for the provider-neutral channel result semantics; this ADR narrows the Kakao send-to-me pilot's recipient model.
