/**
 * G003 Domain API Integration Tests
 *
 * AC2: Tenant isolation — org A cannot read/modify org B data (REST + SSE scope).
 * AC7: /alerts pagination, filter, org scope, cross-org 404.
 * AC8: SSE reconnect with Last-Event-ID → no miss/dup + status re-snapshot.
 * AC9: Ingest HMAC/freshness/idempotency/tenant-coherence/contract validation.
 *
 * Uses DIRECT_URL (fall superuser) for test setup only.
 * Application routes use fall_app (NOSUPERUSER, NOBYPASSRLS).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KakaoClient } from '../src/auth/kakao.client';
import { SessionService } from '../src/auth/session.service';
import { AlertsService } from '../src/alerts/alerts.service';
import { AlertWriterService } from '../src/alerts/alert-writer.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacSha256hex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function makeCanonical(body: {
  resident_id: string;
  facility_id: string;
  type: string;
  detected_at: string;
}): string {
  return `${body.resident_id}|${body.facility_id}|${body.type}|${body.detected_at}`;
}

function makeIngestHeaders(
  keyId: string,
  secret: string,
  body: {
    resident_id: string;
    facility_id: string;
    type: string;
    detected_at: string;
  },
) {
  const canonical = makeCanonical(body);
  const signature = hmacSha256hex(secret, canonical);
  return {
    'x-ingest-key-id': keyId,
    'x-signature': signature,
    'x-ingest-timestamp': Date.now().toString(),
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let app: INestApplication<App>;
let direct: PrismaClient;

const ORG_A = 'g003-org-a';
const ORG_B = 'g003-org-b';
const CAM_A_KEYID = `g003-cam-a-${Date.now()}`;
const CAM_A_SECRET = crypto.randomBytes(16).toString('hex');
const CAM_B_KEYID = `g003-cam-b-${Date.now()}`;
const CAM_B_SECRET = crypto.randomBytes(16).toString('hex');
let resA_id: string;
let resB_id: string;
let camA_id: string;
let camB_id: string;
let sessionCookieA: string;
let sessionCookieB: string;

beforeAll(async () => {
  process.env.SESSION_JWT_SECRET = 'test-session-secret-minimum-32-characters';
  process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
  process.env.KAKAO_REDIRECT_URI = 'http://localhost:3001/auth/kakao/callback';

  direct = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  await direct.$connect();

  // ── Seed orgs, residents, cameras (privileged) ────────────────────────────
  await direct.organization.upsert({
    where: { id: ORG_A },
    update: { name: 'G003 Org A' },
    create: { id: ORG_A, name: 'G003 Org A' },
  });
  await direct.organization.upsert({
    where: { id: ORG_B },
    update: { name: 'G003 Org B' },
    create: { id: ORG_B, name: 'G003 Org B' },
  });

  const resA = await direct.resident.upsert({
    where: { orgId_id: { orgId: ORG_A, id: 'g003-res-a' } },
    update: {},
    create: { id: 'g003-res-a', orgId: ORG_A, name: 'Resident A' },
  });
  const resB = await direct.resident.upsert({
    where: { orgId_id: { orgId: ORG_B, id: 'g003-res-b' } },
    update: {},
    create: { id: 'g003-res-b', orgId: ORG_B, name: 'Resident B' },
  });
  resA_id = resA.id;
  resB_id = resB.id;

  const camA = await direct.camera.upsert({
    where: { orgId_id: { orgId: ORG_A, id: 'g003-cam-a' } },
    update: { ingestKeyId: CAM_A_KEYID, ingestSecretHash: CAM_A_SECRET },
    create: {
      id: 'g003-cam-a',
      orgId: ORG_A,
      residentId: resA.id,
      label: 'G003 Cam A',
      ingestKeyId: CAM_A_KEYID,
      ingestSecretHash: CAM_A_SECRET,
    },
  });
  const camB = await direct.camera.upsert({
    where: { orgId_id: { orgId: ORG_B, id: 'g003-cam-b' } },
    update: { ingestKeyId: CAM_B_KEYID, ingestSecretHash: CAM_B_SECRET },
    create: {
      id: 'g003-cam-b',
      orgId: ORG_B,
      residentId: resB.id,
      label: 'G003 Cam B',
      ingestKeyId: CAM_B_KEYID,
      ingestSecretHash: CAM_B_SECRET,
    },
  });
  camA_id = camA.id;
  camB_id = camB.id;

  // ── Seed users (privileged) ───────────────────────────────────────────────
  let userA = await direct.user.findFirst({
    where: { kakaoId: 'g003-kakao-a' },
  });
  if (!userA) {
    userA = await direct.user.create({
      data: { kakaoId: 'g003-kakao-a', nickname: 'User A', orgId: ORG_A },
    });
  } else {
    await direct.user.update({
      where: { id: userA.id },
      data: { orgId: ORG_A },
    });
    userA = await direct.user.findUniqueOrThrow({ where: { id: userA.id } });
  }
  let userB = await direct.user.findFirst({
    where: { kakaoId: 'g003-kakao-b' },
  });
  if (!userB) {
    userB = await direct.user.create({
      data: { kakaoId: 'g003-kakao-b', nickname: 'User B', orgId: ORG_B },
    });
  } else {
    await direct.user.update({
      where: { id: userB.id },
      data: { orgId: ORG_B },
    });
    userB = await direct.user.findUniqueOrThrow({ where: { id: userB.id } });
  }

  // ── Build NestJS app ──────────────────────────────────────────────────────
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
  await app.init();

  const sessions = app.get(SessionService);
  const sessionA = await sessions.createSession(userA);
  const sessionB = await sessions.createSession(userB);
  sessionCookieA = `app_session=${sessionA.token}`;
  sessionCookieB = `app_session=${sessionB.token}`;
}, 30_000);

afterAll(async () => {
  await direct.alert.deleteMany({ where: { orgId: { in: [ORG_A, ORG_B] } } });
  await direct.residentStatus.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await direct.guardian.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await direct.camera.deleteMany({ where: { orgId: { in: [ORG_A, ORG_B] } } });
  await direct.resident.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await direct.serverSession.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await direct.user.deleteMany({
    where: { kakaoId: { in: ['g003-kakao-a', 'g003-kakao-b'] } },
  });
  await direct.organization.deleteMany({
    where: { id: { in: [ORG_A, ORG_B] } },
  });
  await app.close();
  await direct.$disconnect();
});

// ─── AC2: Tenant Isolation ────────────────────────────────────────────────────

describe('AC2 — tenant isolation (org A cannot access org B data)', () => {
  it('GET /api/residents: org A sees only org A residents', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/residents')
      .set('cookie', sessionCookieA)
      .expect(200);
    const ids = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(resA_id);
    expect(ids).not.toContain(resB_id);
  });

  it('GET /api/residents: org B sees only org B residents', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/residents')
      .set('cookie', sessionCookieB)
      .expect(200);
    const ids = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(resB_id);
    expect(ids).not.toContain(resA_id);
  });

  it('GET /api/residents/:id: org A cannot fetch org B resident (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/residents/${resB_id}`)
      .set('cookie', sessionCookieA)
      .expect(404);
  });

  it('PATCH /api/residents/:id: org A cannot update org B resident', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/residents/${resB_id}`)
      .set('cookie', sessionCookieA)
      .send({ name: 'HACKED' });
    expect([404, 403]).toContain(res.status);
  });

  it('GET /api/cameras: org A sees only org A cameras', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/cameras')
      .set('cookie', sessionCookieA)
      .expect(200);
    const ids = (res.body as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(camA_id);
    expect(ids).not.toContain(camB_id);
  });

  it('GET /api/alerts: org A sees only org A alerts', async () => {
    const detectedAtB = new Date(Date.now() - 1000).toISOString();
    const bodyB = {
      resident_id: resB_id,
      facility_id: ORG_B,
      probability: 0.9,
      snapshot_url: null,
      detected_at: detectedAtB,
      type: 'FALL',
    };
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_B_KEYID, CAM_B_SECRET, {
          resident_id: resB_id,
          facility_id: ORG_B,
          type: 'FALL',
          detected_at: detectedAtB,
        }),
      )
      .send(bodyB)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/alerts')
      .set('cookie', sessionCookieA)
      .expect(200);
    const orgIds = (res.body as Array<{ orgId: string }>).map((a) => a.orgId);
    expect(orgIds.every((id) => id === ORG_A)).toBe(true);
  });

  it('Unauthenticated → 401', async () => {
    await request(app.getHttpServer()).get('/api/residents').expect(401);
    await request(app.getHttpServer()).get('/api/alerts').expect(401);
  });

  it('Null-org session → 403 on data routes', async () => {
    const nullUser = await direct.user.create({
      data: {
        kakaoId: `g003-nullorg-${Date.now()}`,
        nickname: 'NullOrg',
        orgId: null,
      },
    });
    const sessions = app.get(SessionService);
    const nullSession = await sessions.createSession(nullUser);
    const nullCookie = `app_session=${nullSession.token}`;

    await request(app.getHttpServer())
      .get('/api/residents')
      .set('cookie', nullCookie)
      .expect(403);

    await direct.serverSession.deleteMany({ where: { userId: nullUser.id } });
    await direct.user.delete({ where: { id: nullUser.id } });
  });
});

// ─── AC7: Alerts pagination + filter + org scope ──────────────────────────────

describe('AC7 — /alerts pagination, filter, org scope', () => {
  const seqs: string[] = [];
  const now = Date.now();

  beforeAll(async () => {
    for (let i = 0; i < 5; i++) {
      const detectedAt = new Date(now - (5 - i) * 2000).toISOString();
      const body = {
        resident_id: resA_id,
        facility_id: ORG_A,
        probability: i < 3 ? 0.9 : 0.3,
        snapshot_url: null,
        detected_at: detectedAt,
        type: i < 3 ? 'FALL' : 'NORMAL',
      };
      const res = await request(app.getHttpServer())
        .post('/ingest/alerts')
        .set(
          makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
            resident_id: resA_id,
            facility_id: ORG_A,
            type: body.type,
            detected_at: detectedAt,
          }),
        )
        .send(body)
        .expect(201);
      seqs.push((res.body as { alertSeq: string }).alertSeq);
    }
  }, 30_000);

  it('lists alerts in desc order (default)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/alerts')
      .set('cookie', sessionCookieA)
      .expect(200);
    const body = res.body as Array<{ alertSeq: string }>;
    expect(body.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < body.length; i++) {
      expect(BigInt(body[i - 1].alertSeq) >= BigInt(body[i].alertSeq)).toBe(
        true,
      );
    }
  });

  it('filters by residentId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/alerts?residentId=${resA_id}`)
      .set('cookie', sessionCookieA)
      .expect(200);
    const body = res.body as Array<{ residentId: string }>;
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((a) => a.residentId === resA_id)).toBe(true);
  });

  it('pagination via afterSeq returns only newer alerts', async () => {
    if (seqs.length < 2) return;
    const firstSeq = seqs[0];
    const res = await request(app.getHttpServer())
      .get(`/api/alerts?afterSeq=${firstSeq}`)
      .set('cookie', sessionCookieA)
      .expect(200);
    const body = res.body as Array<{ alertSeq: string }>;
    expect(body.every((a) => BigInt(a.alertSeq) > BigInt(firstSeq))).toBe(true);
  });

  it('GET /api/alerts/:id returns 404 for org-B alert to org-A user', async () => {
    const orgBAlerts = await direct.alert.findMany({ where: { orgId: ORG_B } });
    if (!orgBAlerts.length) return;
    await request(app.getHttpServer())
      .get(`/api/alerts/${orgBAlerts[0].id}`)
      .set('cookie', sessionCookieA)
      .expect(404);
  });

  it('PATCH /api/alerts/:id/ack changes status to ACKED', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/alerts?residentId=${resA_id}&limit=1`)
      .set('cookie', sessionCookieA)
      .expect(200);
    const alerts = res.body as Array<{ id: string }>;
    if (!alerts.length) return;
    const ackRes = await request(app.getHttpServer())
      .patch(`/api/alerts/${alerts[0].id}/ack`)
      .set('cookie', sessionCookieA)
      .expect(200);
    expect((ackRes.body as { status: string }).status).toBe('ACKED');
  });
});

// ─── AC8: SSE replay + no-miss under concurrent inserts ───────────────────────

describe('AC8 — SSE replay via Last-Event-ID (alertSeq)', () => {
  it('replays exactly the missed events on reconnect', async () => {
    const t = Date.now();
    const seqsBefore: string[] = [];
    for (let i = 0; i < 3; i++) {
      const detectedAt = new Date(t - (3 - i) * 1500).toISOString();
      const body = {
        resident_id: resA_id,
        facility_id: ORG_A,
        probability: 0.9,
        snapshot_url: null,
        detected_at: detectedAt,
        type: 'FALL',
      };
      const res = await request(app.getHttpServer())
        .post('/ingest/alerts')
        .set(
          makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
            resident_id: resA_id,
            facility_id: ORG_A,
            type: 'FALL',
            detected_at: detectedAt,
          }),
        )
        .send(body)
        .expect(201);
      seqsBefore.push((res.body as { alertSeq: string }).alertSeq);
    }

    const lastSeen = seqsBefore[0];
    const alertsService = app.get(AlertsService);
    const replayed = await alertsService.replay(ORG_A, BigInt(lastSeen));

    expect(replayed.every((a) => a.alertSeq > BigInt(lastSeen))).toBe(true);
    const replayedSeqs = replayed.map((a) => a.alertSeq.toString());
    for (const s of seqsBefore.slice(1)) {
      expect(replayedSeqs).toContain(s);
    }
  }, 30_000);

  it('interleaved concurrent inserts: all committed seqs replayed in order', async () => {
    const writer = app.get(AlertWriterService);
    const t = Date.now();

    const writes = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        writer.writeAlert({
          orgId: ORG_A,
          residentId: resA_id,
          cameraId: camA_id,
          type: 'CONCURRENT',
          probability: 0.9,
          snapshotKey: null,
          detectedAt: new Date(t - (5 - i) * 100),
          idempotencyKey: sha256hex(`concurrent-${t}-${i}`),
        }),
      ),
    );

    const seqs = writes.map((w) => w.alertSeq);
    const unique = new Set(seqs.map(String));
    expect(unique.size).toBe(5);

    const minSeq = seqs.reduce((a, b) => (a < b ? a : b));
    const alertsService = app.get(AlertsService);
    const replayed = await alertsService.replay(ORG_A, minSeq - 1n);
    const replayedSeqsNum = replayed.map((a) => a.alertSeq);

    for (let i = 1; i < replayedSeqsNum.length; i++) {
      expect(replayedSeqsNum[i]).toBeGreaterThan(replayedSeqsNum[i - 1]);
    }

    const replayedSet = new Set(replayedSeqsNum.map(String));
    for (const seq of seqs) {
      expect(replayedSet.has(seq.toString())).toBe(true);
    }
  }, 30_000);

  it('SSE status re-snapshot: GET /api/status returns current ResidentStatus', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/status')
      .set('cookie', sessionCookieA)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── AC9: Ingest validation ───────────────────────────────────────────────────

describe('AC9 — ingest HMAC, freshness, idempotency, tenant coherence, contract', () => {
  const validBody = () => ({
    resident_id: resA_id,
    facility_id: ORG_A,
    probability: 0.9,
    snapshot_url: null,
    detected_at: new Date().toISOString(),
    type: 'FALL',
  });

  it('accepts a valid HMAC-signed request', async () => {
    const body = validBody();
    const res = await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: body.resident_id,
          facility_id: body.facility_id,
          type: body.type,
          detected_at: body.detected_at,
        }),
      )
      .send(body)
      .expect(201);
    expect((res.body as { alertSeq: string }).alertSeq).toBeTruthy();
  });

  it('rejects tampered signature → 401', async () => {
    const body = validBody();
    const headers = makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
      resident_id: body.resident_id,
      facility_id: body.facility_id,
      type: body.type,
      detected_at: body.detected_at,
    });
    headers['x-signature'] = 'deadbeef'.repeat(8);
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(headers)
      .send(body)
      .expect(401);
  });

  it('rejects unknown key-id → 401', async () => {
    const body = validBody();
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders('unknown-key-id', 'any-secret', {
          resident_id: body.resident_id,
          facility_id: body.facility_id,
          type: body.type,
          detected_at: body.detected_at,
        }),
      )
      .send(body)
      .expect(401);
  });

  it('rejects stale detected_at (older than 5 min) → 400', async () => {
    const body = {
      ...validBody(),
      detected_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    };
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: body.resident_id,
          facility_id: body.facility_id,
          type: body.type,
          detected_at: body.detected_at,
        }),
      )
      .send(body)
      .expect(400);
  });

  it('rejects stale X-Ingest-Timestamp → 400', async () => {
    const body = validBody();
    const canonical = makeCanonical({
      resident_id: body.resident_id,
      facility_id: body.facility_id,
      type: body.type,
      detected_at: body.detected_at,
    });
    const signature = hmacSha256hex(CAM_A_SECRET, canonical);
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set({
        'x-ingest-key-id': CAM_A_KEYID,
        'x-signature': signature,
        'x-ingest-timestamp': (Date.now() - 6 * 60 * 1000).toString(),
      })
      .send(body)
      .expect(400);
  });

  it('exact duplicate returns 201 with status=duplicate (not dropped)', async () => {
    const detectedAt = new Date().toISOString();
    const body = {
      resident_id: resA_id,
      facility_id: ORG_A,
      probability: 0.9,
      snapshot_url: null,
      detected_at: detectedAt,
      type: 'DEDUP_TEST',
    };
    const first = await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: body.resident_id,
          facility_id: body.facility_id,
          type: body.type,
          detected_at: body.detected_at,
        }),
      )
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: body.resident_id,
          facility_id: body.facility_id,
          type: body.type,
          detected_at: body.detected_at,
        }),
      )
      .send(body)
      .expect(201);

    expect((first.body as { status: string }).status).toBe('created');
    expect((second.body as { status: string }).status).toBe('duplicate');
    expect((first.body as { alertSeq: string }).alertSeq).toBe(
      (second.body as { alertSeq: string }).alertSeq,
    );
  });

  it('distinct alerts (different detected_at) are never dropped', async () => {
    for (const detected_at of [
      new Date(Date.now() - 2000).toISOString(),
      new Date().toISOString(),
    ]) {
      const body = {
        resident_id: resA_id,
        facility_id: ORG_A,
        probability: 0.8,
        snapshot_url: null,
        detected_at,
        type: 'DISTINCT_TEST',
      };
      const res = await request(app.getHttpServer())
        .post('/ingest/alerts')
        .set(
          makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
            resident_id: body.resident_id,
            facility_id: body.facility_id,
            type: body.type,
            detected_at: body.detected_at,
          }),
        )
        .send(body)
        .expect(201);
      expect((res.body as { status: string }).status).toBe('created');
    }
  });

  it('missing required field (type) → 400 with error=MISSING_FIELD', async () => {
    const body = validBody();
    const bodyNoType: Partial<ReturnType<typeof validBody>> = { ...body };
    delete bodyNoType.type;
    const headersNoType = makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
      resident_id: body.resident_id,
      facility_id: body.facility_id,
      type: '',
      detected_at: body.detected_at,
    });
    const res = await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(headersNoType)
      .send(bodyNoType)
      .expect(400);
    expect((res.body as { error: string }).error).toBe('MISSING_FIELD');
  });

  it('wrong facility_id → 403 TENANT_MISMATCH', async () => {
    const body = {
      ...validBody(),
      facility_id: ORG_B,
    };
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: body.resident_id,
          facility_id: ORG_B,
          type: body.type,
          detected_at: body.detected_at,
        }),
      )
      .send(body)
      .expect(403);
  });

  it('wrong resident_id (cam assigned to different resident) → 403 TENANT_MISMATCH', async () => {
    const body = {
      ...validBody(),
      resident_id: resB_id,
    };
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: resB_id,
          facility_id: ORG_A,
          type: body.type,
          detected_at: body.detected_at,
        }),
      )
      .send(body)
      .expect(403);
  });

  it('missing X-Signature → 401', async () => {
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set({
        'x-ingest-key-id': CAM_A_KEYID,
        'x-ingest-timestamp': Date.now().toString(),
      })
      .send(validBody())
      .expect(401);
  });
});
