/**
 * sim-fall — Demo fall event injector for the eldercare-fall-ai backend.
 *
 * Signs POST /ingest/alerts with HMAC-SHA256 using the camera ingest key.
 * Optionally also sends a heartbeat to POST /ingest/heartbeat.
 *
 * HMAC key derivation:
 *   The seed stores sha256(plaintext_secret) as ingestSecretHash, and the
 *   backend guard uses that hash as the HMAC key.  By default this script
 *   sha256-hashes the provided --secret before signing (matching the seed).
 *   Pass --secret-hashed to use the value directly without hashing (useful
 *   when the HMAC key was stored without pre-hashing, e.g. test fixtures).
 *
 * Usage — env vars:
 *   INGEST_URL=http://localhost:3000 \
 *   INGEST_KEY_ID=demo-cam-01-keyid \
 *   INGEST_SECRET=<plaintext printed by prisma:seed> \
 *   INGEST_RESIDENT_ID=demo-res-01 \
 *   INGEST_FACILITY_ID=demo-org-01 \
 *   npx ts-node --project tsconfig.scripts.json scripts/sim-fall.ts
 *
 * Usage — CLI flags:
 *   npx ts-node --project tsconfig.scripts.json scripts/sim-fall.ts \
 *     --url http://localhost:3000 \
 *     --key-id demo-cam-01-keyid \
 *     --secret <plaintext> \
 *     --resident-id demo-res-01 \
 *     --facility-id demo-org-01 \
 *     [--count 1] [--probability 0.92] [--type FALL] [--heartbeat] [--secret-hashed]
 *
 * Optional authenticated snapshot upload (same production snapshot path):
 *   --snapshot-file /tmp/fall.jpg --session-cookie "app_session=..."
 *   [--snapshot-content-type image/jpeg]
 */
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

// ---------------------------------------------------------------------------
// CLI / env parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function argValue(flag: string, envKey: string, defaultValue?: string): string {
  const idx = argv.indexOf(`--${flag}`);
  if (idx !== -1 && argv[idx + 1] !== undefined && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  const fromEnv = process.env[envKey];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  if (defaultValue !== undefined) return defaultValue;
  console.error(`\nError: required --${flag} or env ${envKey} is not set.\n`);
  process.exit(1);
}

function optionalArgValue(flag: string, envKey: string): string | null {
  const idx = argv.indexOf(`--${flag}`);
  if (idx !== -1 && argv[idx + 1] !== undefined && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  const fromEnv = process.env[envKey];
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : null;
}

function hasFlag(name: string): boolean {
  return argv.includes(`--${name}`);
}

const baseUrl      = argValue('url',         'INGEST_URL',         'http://localhost:3000');
const keyId        = argValue('key-id',      'INGEST_KEY_ID');
const rawSecret    = argValue('secret',      'INGEST_SECRET');
const residentId   = argValue('resident-id', 'INGEST_RESIDENT_ID');
const facilityId   = argValue('facility-id', 'INGEST_FACILITY_ID');
const countStr     = argValue('count',       'INGEST_COUNT',       '1');
const probStr      = argValue('probability', 'INGEST_PROBABILITY', '0.92');
const alertType    = argValue('type',        'INGEST_TYPE',        'FALL');
const sendHeartbeat = hasFlag('heartbeat');
const secretHashed  = hasFlag('secret-hashed');
const snapshotFile = optionalArgValue('snapshot-file', 'INGEST_SNAPSHOT_FILE');
const sessionCookie =
  optionalArgValue('session-cookie', 'INGEST_SESSION_COOKIE') ??
  optionalArgValue('app-session-cookie', 'APP_SESSION_COOKIE');
const snapshotContentType = argValue(
  'snapshot-content-type',
  'INGEST_SNAPSHOT_CONTENT_TYPE',
  'image/jpeg',
);

const count = parseInt(countStr, 10);
if (!Number.isFinite(count) || count < 1) {
  console.error('Error: --count must be a positive integer');
  process.exit(1);
}
const probability = parseFloat(probStr);
if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
  console.error('Error: --probability must be between 0 and 1');
  process.exit(1);
}

// Derive the HMAC key.
// seed stores sha256(plaintext) → guard uses that as HMAC key.
// When --secret-hashed is absent, sha256 the provided value first.
const hmacKey = secretHashed
  ? rawSecret
  : crypto.createHash('sha256').update(rawSecret).digest('hex');
const snapshotBytes = snapshotFile ? fs.readFileSync(snapshotFile) : null;
if (snapshotBytes && !sessionCookie) {
  console.error('Error: --snapshot-file requires --session-cookie (or env INGEST_SESSION_COOKIE).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HMAC helpers — must match backend/src/ingest/hmac.guard.ts
// ---------------------------------------------------------------------------

/** Canonical form: `${resident_id}|${facility_id}|${type}|${detected_at}` */
function makeCanonical(parts: {
  resident_id: string;
  facility_id: string;
  type: string;
  detected_at: string;
}): string {
  return `${parts.resident_id}|${parts.facility_id}|${parts.type}|${parts.detected_at}`;
}

function signCanonical(key: string, canonical: string): string {
  return crypto.createHmac('sha256', key).update(canonical).digest('hex');
}

function ingestHeaders(parts: {
  resident_id: string;
  facility_id: string;
  type: string;
  detected_at: string;
}): Record<string, string> {
  const canonical = makeCanonical(parts);
  const signature = signCanonical(hmacKey, canonical);
  return {
    'content-type':        'application/json',
    'x-ingest-key-id':     keyId,
    'x-signature':         signature,
    'x-ingest-timestamp':  Date.now().toString(),
  };
}

// ---------------------------------------------------------------------------
// Minimal HTTP request helper (no external deps)
// ---------------------------------------------------------------------------

interface HttpResult {
  status: number;
  body: string;
}

function httpRequest(
  method: 'POST' | 'PUT',
  targetUrl: string,
  headers: Record<string, string>,
  body: string | Buffer,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method,
        headers:  { ...headers, 'content-length': String(bodyBuf.length) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

function httpPost(targetUrl: string, headers: Record<string, string>, body: string): Promise<HttpResult> {
  return httpRequest('POST', targetUrl, headers, body);
}

function httpPut(targetUrl: string, headers: Record<string, string>, body: Buffer): Promise<HttpResult> {
  return httpRequest('PUT', targetUrl, headers, body);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    `sim-fall: ${count} alert(s) → ${baseUrl}/ingest/alerts` +
    `  [type=${alertType}, p=${probability}, keyId=${keyId}]`,
  );
  if (snapshotBytes) {
    console.log(
      `sim-fall: authenticated snapshot upload enabled ` +
      `[${snapshotContentType}, ${snapshotBytes.length} bytes]`,
    );
  }

  for (let i = 0; i < count; i++) {
    // Use current time; each iteration gets a fresh timestamp to avoid
    // idempotency-key collisions when count > 1.
    if (i > 0) {
      await new Promise<void>((r) => setTimeout(r, 60));
    }

    const detectedAt = new Date().toISOString();
    const payload = {
      resident_id:   residentId,
      facility_id:   facilityId,
      probability,
      snapshot_url:  null,
      detected_at:   detectedAt,
      type:          alertType,
    };
    const headers = ingestHeaders({
      resident_id: residentId,
      facility_id: facilityId,
      type:        alertType,
      detected_at: detectedAt,
    });

    const res = await httpPost(`${baseUrl}/ingest/alerts`, headers, JSON.stringify(payload));

    if (res.status === 201 || res.status === 200) {
      const label = res.status === 201 ? '✓ 201 created' : '⟳ 200 duplicate';
      console.log(`  [${i + 1}/${count}] ${label} — ${res.body.trimEnd()}`);

      if (snapshotBytes) {
        let alertId: string | null = null;
        try {
          const parsed = JSON.parse(res.body) as { id?: unknown };
          alertId = typeof parsed.id === 'string' ? parsed.id : null;
        } catch {
          alertId = null;
        }
        if (!alertId) {
          console.error(`  [${i + 1}/${count}] ✗ snapshot upload skipped — response did not include alert id`);
          process.exit(1);
        }
        const upload = await httpPut(
          `${baseUrl}/api/snapshots/${encodeURIComponent(alertId)}`,
          {
            'content-type': snapshotContentType,
            cookie:         sessionCookie as string,
          },
          snapshotBytes,
        );
        if (upload.status === 201) {
          console.log(`      ↳ snapshot 201 — ${upload.body.trimEnd()}`);
        } else {
          console.error(`      ↳ snapshot ✗ ${upload.status} — ${upload.body.trimEnd()}`);
          process.exit(1);
        }
      }
    } else {
      console.error(`  [${i + 1}/${count}] ✗ ${res.status} — ${res.body.trimEnd()}`);
      process.exit(1);
    }
  }

  if (sendHeartbeat) {
    console.log(`\nsim-fall: heartbeat → ${baseUrl}/ingest/heartbeat`);
    // Heartbeat body is empty; canonical = "|||" (all fields undefined).
    const hbCanonical = '|||';
    const signature = signCanonical(hmacKey, hbCanonical);
    const res = await httpPost(
      `${baseUrl}/ingest/heartbeat`,
      {
        'content-type':       'application/json',
        'x-ingest-key-id':    keyId,
        'x-signature':        signature,
        'x-ingest-timestamp': Date.now().toString(),
      },
      '{}',
    );
    if (res.status === 200) {
      console.log(`  ✓ heartbeat 200 — ${res.body.trimEnd()}`);
    } else {
      console.error(`  ✗ heartbeat ${res.status} — ${res.body.trimEnd()}`);
      process.exit(1);
    }
  }

  console.log('\nsim-fall: done.');
}

main().catch((err: unknown) => {
  console.error('sim-fall fatal error:', err);
  process.exit(1);
});
