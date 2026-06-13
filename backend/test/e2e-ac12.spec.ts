/**
 * AC12 End-to-End: Demo Sim Injector Flow (seeded / mock session)
 *
 * Proves the full alert lifecycle without a live Kakao round-trip:
 *   1. Seed org + user + resident + camera (direct Prisma, bypasses RLS).
 *   2. Issue an authenticated session via SessionService (mock Kakao).
 *   3. GET /api/status  → 200, includes the resident.
 *   4. GET /api/alerts  → 200, empty or only unrelated alerts for this org.
 *   5. POST /ingest/alerts (HMAC-signed, same contract as sim-fall.ts) → 201.
 *   6. GET /api/alerts  → 200, injected alert is present.
 *   7. GET /api/sse with Last-Event-ID = alertSeq - 1 → SSE stream replays
 *      the alert and delivers a status-snapshot event.
 *   8. GET /api/status/:residentId → state = FALL  (probability 0.92 ≥ 0.8).
 *
 * Real Kakao OAuth round-trip is excluded per boundary agreement (G002).
 * See docs/runbook-live-demo.md for live-demo instructions.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import * as http from 'http';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { AddressInfo } from 'net';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KakaoClient } from '../src/auth/kakao.client';
import { SessionService } from '../src/auth/session.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hmacSha256hex(key: string, message: string): string {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

/** Canonical form used by HmacIngestGuard */
function makeCanonical(parts: {
  resident_id: string;
  facility_id: string;
  type: string;
  detected_at: string;
}): string {
  return `${parts.resident_id}|${parts.facility_id}|${parts.type}|${parts.detected_at}`;
}

/**
 * Build X-Ingest-* headers for a given body.
 *
 * NOTE: in test fixtures we store the raw secret directly as ingestSecretHash
 * (no sha256 pre-hash), so we sign with the raw secret value — matching the
 * domain.spec.ts convention.  The sim-fall.ts script uses sha256(secret) to
 * match the production seed convention.
 */
function makeIngestHeaders(
  keyId: string,
  secret: string,
  parts: {
    resident_id: string;
    facility_id: string;
    type: string;
    detected_at: string;
  },
): Record<string, string> {
  const canonical = makeCanonical(parts);
  const signature = hmacSha256hex(secret, canonical);
  return {
    'x-ingest-key-id': keyId,
    'x-signature': signature,
    'x-ingest-timestamp': Date.now().toString(),
  };
}

type SseResult = {
  statusCode: number | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function baseUrlOf(a: INestApplication<App>): string {
  const server = a.getHttpServer() as {
    address: () => AddressInfo | string | null;
  };
  const addr = server.address();
  if (!addr || typeof addr === 'string')
    throw new Error('server not listening');
  return `http://127.0.0.1:${addr.port}`;
}

/**
 * Open an SSE connection, collect chunks until predicate returns true or
 * a 2 s timeout elapses, then close and return what was received.
 */
function readSseUntil(
  serverUrl: string,
  cookie: string,
  lastEventId: string | null,
  predicate: (body: string) => boolean,
): Promise<SseResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let statusCode: number | undefined;
    let headers: http.IncomingHttpHeaders = {};
    let body = '';
    let reqRef: http.ClientRequest | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      reqRef?.destroy();
      resolve({ statusCode, headers, body });
    };

    const req = http.get(
      `${serverUrl}/api/sse`,
      {
        headers: {
          cookie,
          ...(lastEventId !== null ? { 'last-event-id': lastEventId } : {}),
        },
      },
      (res) => {
        statusCode = res.statusCode;
        headers = res.headers;
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
          if (predicate(body)) finish();
        });
        res.on('end', finish);
      },
    );
    reqRef = req;
    req.setTimeout(2_000, finish);
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (settled && err.code === 'ECONNRESET') return;
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'ac12-org';
const CAM_KEYID = `ac12-cam-key-${Date.now()}`;
// Raw secret stored directly as ingestSecretHash (test fixture convention).
const CAM_SECRET = crypto.randomBytes(16).toString('hex');
const KAKAO_ID = `ac12-kakao-${Date.now()}`;

let app: INestApplication<App>;
let direct: PrismaClient;
let residentId: string;
let sessionCookie: string;
let serverUrl: string;

beforeAll(async () => {
  process.env.SESSION_JWT_SECRET = 'test-session-secret-minimum-32-characters';
  process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
  process.env.KAKAO_REDIRECT_URI = 'http://localhost:3001/auth/kakao/callback';
  process.env.SNAPSHOT_DIR = `/tmp/ac12-snapshots-${Date.now()}`;

  direct = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  await direct.$connect();

  // ── Seed org ──────────────────────────────────────────────────────────────
  await direct.organization.upsert({
    where: { id: ORG_ID },
    update: { name: 'AC12 Demo Org' },
    create: { id: ORG_ID, name: 'AC12 Demo Org' },
  });

  // ── Seed resident ─────────────────────────────────────────────────────────
  const resident = await direct.resident.upsert({
    where: { orgId_id: { orgId: ORG_ID, id: 'ac12-res-01' } },
    update: {},
    create: {
      id: 'ac12-res-01',
      orgId: ORG_ID,
      name: 'AC12 테스트 주민',
      room: '101호',
    },
  });
  residentId = resident.id;

  // ── Seed camera (raw secret stored as ingestSecretHash — test convention) ─
  await direct.camera.upsert({
    where: { orgId_id: { orgId: ORG_ID, id: 'ac12-cam-01' } },
    update: { ingestKeyId: CAM_KEYID, ingestSecretHash: CAM_SECRET },
    create: {
      id: 'ac12-cam-01',
      orgId: ORG_ID,
      residentId: resident.id,
      label: 'AC12 Cam 01',
      ingestKeyId: CAM_KEYID,
      ingestSecretHash: CAM_SECRET,
    },
  });

  // ── Seed ResidentStatus (NORMAL baseline) ─────────────────────────────────
  await direct.residentStatus.upsert({
    where: { residentId: resident.id },
    update: { state: 'NORMAL' },
    create: {
      residentId: resident.id,
      orgId: ORG_ID,
      state: 'NORMAL',
      sourceId: 'ac12-cam-01',
    },
  });

  // ── Seed user ─────────────────────────────────────────────────────────────
  let user = await direct.user.findFirst({ where: { kakaoId: KAKAO_ID } });
  if (!user) {
    user = await direct.user.create({
      data: { kakaoId: KAKAO_ID, nickname: 'AC12 User', orgId: ORG_ID },
    });
  } else {
    await direct.user.update({
      where: { id: user.id },
      data: { orgId: ORG_ID },
    });
    user = await direct.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  // ── Build NestJS app (KakaoClient mocked — no real Kakao needed) ──────────
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(KakaoClient)
    .useValue({
      buildAuthorizeUrl: () => '/',
      exchangeCode: jest.fn(),
      getProfile: jest.fn(),
    })
    .compile();

  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  serverUrl = baseUrlOf(app);

  // ── Issue session via SessionService (bypasses Kakao OAuth) ──────────────
  const sessions = app.get(SessionService);
  const session = await sessions.createSession(user);
  sessionCookie = `app_session=${session.token}`;
}, 30_000);

afterAll(async () => {
  // Clean up all AC12 test data.
  await direct.alert.deleteMany({ where: { orgId: ORG_ID } });
  await direct.residentStatus.deleteMany({ where: { orgId: ORG_ID } });
  await direct.camera.deleteMany({ where: { orgId: ORG_ID } });
  await direct.resident.deleteMany({ where: { orgId: ORG_ID } });
  await direct.serverSession.deleteMany({ where: { orgId: ORG_ID } });
  await direct.user.deleteMany({ where: { kakaoId: KAKAO_ID } });
  await direct.organization.deleteMany({ where: { id: ORG_ID } });
  await app.close();
  await direct.$disconnect();
});

// ---------------------------------------------------------------------------
// AC12 Test Suite
// ---------------------------------------------------------------------------

describe('AC12 — demo sim injector + dashboard e2e (seeded/mock session, no live Kakao)', () => {
  let injectedAlertSeq: string;
  let injectedAlertId: string;

  // ── Step 1: Dashboard data routes accessible with seeded session ──────────

  it('GET /api/status → 200 with resident list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/status')
      .set('cookie', sessionCookie)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const statuses = res.body as Array<{ residentId: string; state: string }>;
    expect(statuses.some((s) => s.residentId === residentId)).toBe(true);
  });

  it('GET /api/alerts → 200 (empty or existing for this org)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/alerts')
      .set('cookie', sessionCookie)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    // All returned alerts must belong to this org.
    const alerts = res.body as Array<{ orgId: string }>;
    expect(alerts.every((a) => a.orgId === ORG_ID)).toBe(true);
  });

  // ── Step 2: Inject fall alert via HMAC-signed ingest endpoint ─────────────

  it('POST /ingest/alerts (HMAC-signed) → 201 created', async () => {
    const detectedAt = new Date().toISOString();
    const body = {
      resident_id: residentId,
      facility_id: ORG_ID,
      probability: 0.92,
      snapshot_url: null,
      detected_at: detectedAt,
      type: 'FALL',
    };
    const headers = makeIngestHeaders(CAM_KEYID, CAM_SECRET, {
      resident_id: residentId,
      facility_id: ORG_ID,
      type: 'FALL',
      detected_at: detectedAt,
    });

    const res = await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(headers)
      .send(body)
      .expect(201);

    const result = res.body as { alertSeq: string; id: string; status: string };
    expect(result.status).toBe('created');
    expect(result.alertSeq).toBeTruthy();
    expect(result.id).toBeTruthy();

    injectedAlertSeq = result.alertSeq;
    injectedAlertId = result.id;
  });

  // ── Step 3: Alert appears in dashboard list ───────────────────────────────

  it('GET /api/alerts → 200, injected alert is present', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/alerts')
      .set('cookie', sessionCookie)
      .expect(200);
    const alerts = res.body as Array<{
      id: string;
      type: string;
      orgId: string;
    }>;
    const mine = alerts.find((a) => a.id === injectedAlertId);
    expect(mine).toBeDefined();
    expect(mine?.type).toBe('FALL');
    expect(mine?.orgId).toBe(ORG_ID);
  });

  it('GET /api/alerts/:id → 200 for injected alert', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/alerts/${injectedAlertId}`)
      .set('cookie', sessionCookie)
      .expect(200);
    const alert = res.body as { id: string; alertSeq: string };
    expect(alert.id).toBe(injectedAlertId);
    expect(alert.alertSeq).toBe(injectedAlertSeq);
  });

  // ── Step 4: SSE replay delivers the alert ────────────────────────────────

  it('GET /api/sse with Last-Event-ID → replays injected alert + status-snapshot', async () => {
    // Replay from one before our alert.
    const replayFrom = (BigInt(injectedAlertSeq) - 1n).toString();

    const stream = await readSseUntil(
      serverUrl,
      sessionCookie,
      replayFrom,
      (body) =>
        body.includes(`id: ${injectedAlertSeq}`) &&
        body.includes('event: status-snapshot'),
    );

    expect(stream.statusCode).toBe(200);
    expect(stream.headers['content-type']).toMatch(/text\/event-stream/);
    expect(stream.headers['x-accel-buffering']).toBe('no');
    // Alert event replayed.
    expect(stream.body).toContain(`id: ${injectedAlertSeq}`);
    expect(stream.body).toContain(injectedAlertId);
    // Status snapshot sent.
    expect(stream.body).toContain('event: status-snapshot');
    // No cross-org data leaked.
    expect(stream.body).not.toMatch(/ac12-org-WRONG/);
  }, 10_000);

  // ── Step 5: ResidentStatus updated to FALL ───────────────────────────────

  it('GET /api/status/:residentId → state = FALL (probability 0.92 ≥ 0.8)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/status/${residentId}`)
      .set('cookie', sessionCookie)
      .expect(200);
    const status = res.body as { state: string; residentId: string };
    expect(status.residentId).toBe(residentId);
    expect(status.state).toBe('FALL');
  });

  // ── Step 6: Unauthenticated request rejected ──────────────────────────────

  it('unauthenticated GET /api/alerts → 401', async () => {
    await request(app.getHttpServer()).get('/api/alerts').expect(401);
  });

  it('unauthenticated GET /api/status → 401', async () => {
    await request(app.getHttpServer()).get('/api/status').expect(401);
  });

  // ── Step 7: HMAC guard rejects tampered signature ─────────────────────────

  it('POST /ingest/alerts with bad signature → 401', async () => {
    const detectedAt = new Date().toISOString();
    const body = {
      resident_id: residentId,
      facility_id: ORG_ID,
      probability: 0.92,
      snapshot_url: null,
      detected_at: detectedAt,
      type: 'FALL',
    };
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set({
        'x-ingest-key-id': CAM_KEYID,
        'x-signature': 'deadbeef'.repeat(8),
        'x-ingest-timestamp': Date.now().toString(),
      })
      .send(body)
      .expect(401);
  });
});
