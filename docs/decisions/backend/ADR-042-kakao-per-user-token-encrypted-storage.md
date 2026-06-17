# ADR-042: Kakao per-user token encrypted storage

## Status
Accepted

## Date
2026-06-17

## Context

ADR-033 established the Kakao OAuth boundary: the backend owns the callback, issues a single httpOnly session JWT, and never sends Kakao tokens to the browser. That boundary remains correct for browser safety, but the Thursday MVP send-to-me fan-out requirement adds a new backend-side need: Kakao Developers send-to-me can deliver only to the token owner, so each recipient User must have their own `talk_message` access token available to the server.

The prior build intentionally did not store Kakao access or refresh tokens. That made the browser boundary simple, but it also made multi-recipient Kakao send-to-me fan-out impossible. A single server token file can prove the provider adapter, but it cannot send to two OAuth'd users' KakaoTalk accounts.

This ADR extends ADR-033 by keeping tokens out of the browser while allowing encrypted, per-user backend storage of the access token needed for the pilot fan-out.

## Decision

Store each OAuth'd user's Kakao send-to-me access token in `KakaoIdentity.accessTokenCipher`, with the granted scope recorded in `KakaoIdentity.tokenScope`.

Token storage rules:

- Encrypt the access token with AES-256-GCM before persistence.
- Read the encryption key from `KAKAO_TOKEN_ENC_KEY`; it must decode to exactly 32 bytes.
- Fail closed when the key is missing, malformed, the ciphertext cannot be authenticated, or token decryption fails.
- Generate a fresh 96-bit IV for every encryption operation.
- Persist the IV, ciphertext, auth tag, and payload version together in the cipher payload.
- Never log plaintext tokens, encryption keys, bearer headers, OAuth authorization codes, or client-id-bearing authorization URLs.
- Never send Kakao access tokens to the browser; ADR-033's browser boundary remains active.

Only the server decrypts a token immediately before a provider call that requires it. Refresh-token storage and automatic rotation are explicitly deferred.

## Alternatives Considered

### Single `KAKAO_TOKEN_PATH` token file

- Pros: already supported by the send-to-me pilot adapter; simplest local proof of provider delivery.
- Cons: represents exactly one Kakao account and cannot send to multiple OAuth'd users.
- Rejected: it cannot satisfy fan-out to both demo operators.

### Plaintext database storage

- Pros: easier to implement and inspect during debugging.
- Cons: turns a database read or log leak into raw Kakao credential disclosure.
- Rejected: provider tokens are secrets and must not be stored plaintext.

### Keep not storing Kakao tokens

- Pros: preserves the original minimal OAuth persistence model from ADR-033.
- Cons: send-to-me fan-out has no credential with which to send to each recipient.
- Rejected: it makes the required multi-user alert delivery impossible.

## Consequences

- `KAKAO_TOKEN_ENC_KEY` becomes required configuration for Kakao token persistence and fan-out surfaces.
- Operators are responsible for key custody; losing the key makes existing token ciphertext undecryptable.
- Refresh-token storage, token refresh, expiry rotation, and key rotation remain follow-up hardening work.
- ADR-033 remains the authority for backend-owned OAuth callback and browser token non-disclosure; this ADR extends it with encrypted server-side access-token storage.
