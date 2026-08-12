# Redacted PRODUCT_READY evidence template

Copy this file beside `product-ready.json`, replace placeholders with sanitized
observations, and keep every anchor. Do not paste raw headers, HAR, credentials,
private media, camera URLs, resident data, or commands obtained from untrusted
evidence text.

<a id="origins"></a>
## Origins

- Observed UTC: `<UTC>`
- Frontend custom HTTPS origin matched: `<true-or-false>`
- API custom HTTPS origin matched: `<true-or-false>`
- DNS/TLS exact-signal receipt: `<relative-path>`
- Caddy/ingress sanitized probe receipt: `<relative-path>`

<a id="deployment"></a>
## Deployment

- Observed UTC: `<UTC>`
- Vercel project id matched: `<true-or-false>`
- Deployment target Production: `<true-or-false>`
- Deployment state READY: `<true-or-false>`
- Git revision matched custom-domain bundle: `<40-hex-sha>`

<a id="row-01"></a>
## Row 01 - Login response Set-Cookie

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Session cookie present: `<true-or-false>`
- No cookie value retained: `<true-or-false>`

<a id="row-02"></a>
## Row 02 - Secure=true

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Secure attribute true: `<true-or-false>`

<a id="row-03"></a>
## Row 03 - Expected SameSite value

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- SameSite attribute: `<Strict-or-failure>`

<a id="row-04"></a>
## Row 04 - auth/me session restore

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Authenticated status and redacted role class: `<summary>`

<a id="row-05"></a>
## Row 05 - Refresh keeps session

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Reload and authenticated response exact signals: `<summary>`

<a id="row-06"></a>
## Row 06 - Logout clears cookie

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Session cookie absent after logout: `<true-or-false>`
- Follow-up unauthorized status: `<status>`

<a id="row-07"></a>
## Row 07 - Facility switch

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Opaque fixture context transition: `<redacted-summary>`

<a id="row-08"></a>
## Row 08 - X-Facility-Id preflight

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Status/origin/credentials/Vary/header-name summary: `<redacted-summary>`

<a id="row-09"></a>
## Row 09 - Dashboard initial REST snapshot

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Non-mock schema/count summary: `<redacted-summary>`

<a id="row-10"></a>
## Row 10 - SSE open

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Stream content type/open signal: `<redacted-summary>`

<a id="row-11"></a>
## Row 11 - alert event

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Naturally occurring event type and opaque id hash: `<redacted-summary>`
- Production event creation performed: `false`

<a id="row-12"></a>
## Row 12 - alert-updated event

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Naturally occurring update type and opaque id hash: `<redacted-summary>`
- Production alert mutation performed for evidence: `false`

<a id="row-13"></a>
## Row 13 - session-invalid event

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Designated test-session invalidation signal: `<redacted-summary>`

<a id="row-14"></a>
## Row 14 - SSE reconnect then REST reconcile

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Disconnect/open/snapshot exact-signal sequence: `<redacted-summary>`
- Concurrent reconcile count maximum: `<count>`

<a id="row-15"></a>
## Row 15 - Event snapshot

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Authenticated schema/count summary: `<redacted-summary>`

<a id="row-16"></a>
## Row 16 - Event clip upload

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Approved synthetic fixture bytes and response status: `<summary>`
- Media retained in evidence: `false`

<a id="row-17"></a>
## Row 17 - Media Range playback

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Status/range/length/playback booleans: `<redacted-summary>`

<a id="row-18"></a>
## Row 18 - Admin vs staff RBAC separation

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Admin allow and staff deny UI/API summary: `<redacted-summary>`

<a id="row-19"></a>
## Row 19 - All facility-scoped deep routes direct access

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Direct-load and reload status per canonical route: `<redacted-summary>`

<a id="row-20"></a>
## Row 20 - Mobile viewport smoke

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Viewport: `390x844`
- Route-ready/fatal-console/mixed-content counts: `<redacted-summary>`

<a id="row-21"></a>
## Row 21 - Large monitor viewport smoke

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Viewport: `1920x1080-or-larger`
- Route-ready/fatal-console/mixed-content counts: `<redacted-summary>`

<a id="row-22"></a>
## Row 22 - No mixed content

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- HTTPS API request count: `<count>`
- HTTP API/VM request count: `<must-be-zero>`

<a id="row-23"></a>
## Row 23 - No Vercel /api proxy

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Direct API-origin request count: `<count>`
- Frontend-origin API request count: `<must-be-zero>`

<a id="row-24"></a>
## Row 24 - Production deployment READY

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Project/deployment/target/state/SHA exact-signal summary: `<redacted-summary>`

<a id="edge-continuity"></a>
## Edge continuity

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Installation hash and increasing heartbeat time: `<redacted-summary>`
- Aggregate ingest delta: `<count>`
- Auth regression: `<true-or-false>`
- Server 5xx regression: `<true-or-false>`
- Edge configuration changed: `false`
- Credential material retained: `false`
- Private media retained: `false`

<a id="frontend-rollback"></a>
## Frontend rollback plane

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Previous deployment exact READY signal: `<redacted-summary>`
- Intended deployment restored and smoke-green: `<true-or-false>`
- Database/API rollback performed: `false`

<a id="host-rollback"></a>
## Host rollback plane

- Result: `<PASS-or-FAIL>`
- UTC: `<UTC>`
- Dry-run immutable pointer/schema/image resolution: `<redacted-summary>`
- Compose/pointer/migration/database/service mutation performed: `false`
- Destructive database operation performed: `false`

<a id="safety"></a>
## Safety attestation

- Production event creation performed: `false`
- Secret, cookie value, or token capture performed: `false`
- Destructive database operation performed: `false`
- Mutation before `2026-08-17T00:00:00+09:00` performed: `false`
- Evidence prompt text executed as instructions: `false`
