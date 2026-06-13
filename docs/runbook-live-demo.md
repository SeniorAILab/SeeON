# Live Demo Runbook — Eldercare Fall AI

**Branch**: feat/102  
**Date**: 2026-06-13

This runbook covers running the full demo with a real Kakao OAuth login and the
`sim-fall` injector.  For automated CI/e2e without Kakao credentials, see
`backend/test/e2e-ac12.spec.ts`.

---

## Prerequisites

| Item | Value |
|------|-------|
| Docker | running |
| Node.js | ≥ 18 |
| pnpm | ≥ 9 |
| Kakao REST API Key | obtained from [Kakao Developers](https://developers.kakao.com/) |
| Kakao Redirect URI | **`http://localhost:3001/auth/kakao/callback`** |

---

## 1. Clone / switch to branch

```bash
git checkout feat/102
```

---

## 2. Set environment variables

### Backend — `backend/.env.development`

```dotenv
NODE_ENV=development
PORT=3000

# Runtime app role (NOSUPERUSER NOBYPASSRLS)
DATABASE_URL="postgresql://fall_app:fall_app@localhost:5432/fall_dev?schema=public"

# Privileged role for migrations and seed
DIRECT_URL="postgresql://fall:fall@localhost:5432/fall_dev?schema=public"

# Session signing — use a strong random value in production
SESSION_JWT_SECRET="<at-least-32-char-random-string>"

# Kakao OAuth — real keys for live demo
KAKAO_REST_API_KEY="<your-kakao-rest-api-key>"
KAKAO_REDIRECT_URI="http://localhost:3001/auth/kakao/callback"

ML_SERVING_URL="http://localhost:8000"
```

### Frontend — `front/.env.local`

```dotenv
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

---

## 3. Start the database

```bash
pnpm db:up
# Waits until the eldercare-fall-db container reports healthy (~10 s)
```

---

## 4. Run migrations

```bash
cd backend
pnpm prisma:migrate
```

---

## 5. Seed demo data

```bash
pnpm prisma:seed
```

**Copy and save the camera secrets printed to stdout.** They are never stored
in the database — only the SHA-256 hash is persisted.  Example output:

```
Seed complete.
Camera secrets (save these — they are not stored in DB):
  Cam 01: secret=a3f7...  keyId=demo-cam-01-keyid
  Cam 02: secret=9b2c...  keyId=demo-cam-02-keyid
```

You will need `secret` and `keyId` for the sim-fall injector in step 8.

---

## 6. Start backend and frontend

Open two terminals:

**Terminal A — backend**
```bash
cd backend
pnpm start:dev
# Listening on http://localhost:3000
```

**Terminal B — frontend**
```bash
cd front
pnpm dev
# Listening on http://localhost:3001
```

---

## 7. Kakao login and onboarding

> **This step requires real Kakao credentials.**
> The automated AC12 e2e test covers all other steps without Kakao.

1. Open **http://localhost:3001** in a browser.
2. Click **카카오로 로그인 (Login with Kakao)**.
3. Authorise the app in the Kakao popup.
4. You are redirected back to `http://localhost:3001/auth/kakao/callback`.
5. Complete the onboarding wizard:
   - Enter facility name → creates your `Organization` record.
   - Add residents and associate cameras using the keyId values from seed output.
6. You land on the dashboard.

---

## 8. Inject a simulated fall event

Use `sim-fall.ts` to send a HMAC-signed fall alert to the running backend.

```bash
cd backend

# Fill in the values printed by `pnpm prisma:seed` (step 5 above).
INGEST_KEY_ID="demo-cam-01-keyid" \
INGEST_SECRET="<plaintext secret from seed output>" \
INGEST_RESIDENT_ID="demo-res-01" \
INGEST_FACILITY_ID="demo-org-01" \
npx ts-node --project tsconfig.scripts.json scripts/sim-fall.ts \
  --url http://localhost:3000 \
  --probability 0.95 \
  --type FALL \
  --count 3 \
  --heartbeat
```

Expected output:

```
sim-fall: 3 alert(s) → http://localhost:3000/ingest/alerts  [type=FALL, p=0.95, keyId=demo-cam-01-keyid]
  [1/3] ✓ 201 created — {"alertSeq":"42","id":"clxxx...","status":"created"}
  [2/3] ✓ 201 created — {"alertSeq":"43","id":"clxxx...","status":"created"}
  [3/3] ✓ 201 created — {"alertSeq":"44","id":"clxxx...","status":"created"}

sim-fall: heartbeat → http://localhost:3000/ingest/heartbeat
  ✓ heartbeat 200 — {"ok":true}

sim-fall: done.
```

### Flag reference

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--url` | `INGEST_URL` | `http://localhost:3000` | Backend base URL |
| `--key-id` | `INGEST_KEY_ID` | *(required)* | Camera ingest key ID |
| `--secret` | `INGEST_SECRET` | *(required)* | Plaintext secret from seed |
| `--resident-id` | `INGEST_RESIDENT_ID` | *(required)* | Resident ID |
| `--facility-id` | `INGEST_FACILITY_ID` | *(required)* | Org/facility ID |
| `--count` | `INGEST_COUNT` | `1` | Number of events |
| `--probability` | `INGEST_PROBABILITY` | `0.92` | 0–1; ≥ 0.8 triggers FALL |
| `--type` | `INGEST_TYPE` | `FALL` | Alert type string |
| `--heartbeat` | — | off | Also send a heartbeat |
| `--secret-hashed` | — | off | Treat `--secret` as already the HMAC key (skip sha256) |

> **Key derivation note:** The seed stores `sha256(plaintext_secret)` as
> `ingestSecretHash` in the database.  `sim-fall.ts` automatically applies
> `sha256` to the provided `--secret` before signing.  Pass `--secret-hashed`
> only when the value is already the raw HMAC key (e.g. direct test fixtures).

---

## 9. Verify on dashboard

1. Return to **http://localhost:3001**.
2. The dashboard feed should show the injected FALL alerts in real-time via SSE.
3. The resident status card for 홍길동 (demo-res-01) should change to **낙상 감지 (FALL)**.
4. Acknowledge an alert by clicking the ACK button.

---

## Scope of automated tests (no Kakao required)

`backend/test/e2e-ac12.spec.ts` covers steps 3–8 fully with a seeded session:

```bash
cd backend
npm test -- --testPathPatterns="e2e-ac12"
```

**What is not covered by automated tests (requires real Kakao):**

- The Kakao OAuth consent screen and token exchange.
- The `/auth/kakao/callback` redirect flow in the browser.
- The onboarding wizard UI.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `401` from `sim-fall.ts` | Wrong `--secret` or `--key-id`. Re-run `pnpm prisma:seed` and copy fresh values. |
| `400 StaleTimestamp` | System clock skew > 5 min, or `detected_at` too old. Ensure system time is accurate. |
| `400 TenantMismatch` | `--facility-id` doesn't match the camera's org. Use the org ID printed by seed. |
| Kakao `redirect_uri_mismatch` | Add `http://localhost:3001/auth/kakao/callback` to Kakao app's allowed redirect URIs. |
| DB connection refused | Run `pnpm db:up` and wait for the container to be healthy. |
