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
import * as fs from 'fs';
import * as http from 'http';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { AddressInfo } from 'net';
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

type SseRead = {
  statusCode: number | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function baseUrl(): string {
  const server = app.getHttpServer() as {
    address: () => AddressInfo | string | null;
  };
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test server is not listening');
  }
  return `http://127.0.0.1:${address.port}`;
}

function readSseUntil(
  cookie: string,
  lastEventId: string | null,
  predicate: (body: string) => boolean,
): Promise<SseRead> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let statusCode: number | undefined;
    let headers: http.IncomingHttpHeaders = {};
    let body = '';
    let requestRef: http.ClientRequest | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      const ref = requestRef; // snapshot avoids TS 5.7 narrowing-to-never in closure
      if (ref) ref.destroy();
      resolve({ statusCode, headers, body });
    };
    const req = http.get(
      `${baseUrl()}/api/sse`,
      {
        headers: {
          cookie,
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
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
    requestRef = req;
    req.setTimeout(2_000, finish);
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (settled && err.code === 'ECONNRESET') return;
      reject(err);
    });
  });
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
const SNAPSHOT_DIR = `/tmp/g003-snapshots-${Date.now()}`;
const OUTSIDE_SNAPSHOT = `/tmp/g003-outside-${Date.now()}.jpg`;
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
  process.env.SNAPSHOT_DIR = SNAPSHOT_DIR;
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

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
  await app.listen(0, '127.0.0.1');

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
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  fs.rmSync(OUTSIDE_SNAPSHOT, { force: true });
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

  it('DELETE org-scoped admin resources: resident, guardian, and camera stay tenant-bound', async () => {
    const resident = await request(app.getHttpServer())
      .post('/api/residents')
      .set('cookie', sessionCookieA)
      .send({ name: 'Delete Resident', room: 'D1' })
      .expect(201);
    const residentId = (resident.body as { id: string }).id;

    const guardian = await request(app.getHttpServer())
      .post('/api/guardians')
      .set('cookie', sessionCookieA)
      .send({ residentId, name: 'Delete Guardian', phone: '01000001111' })
      .expect(201);
    const guardianId = (guardian.body as { id: string }).id;

    const camera = await request(app.getHttpServer())
      .post('/api/cameras')
      .set('cookie', sessionCookieA)
      .send({ label: `Delete Cam ${Date.now()}` })
      .expect(201);
    const cameraId = (camera.body as { id: string }).id;

    await request(app.getHttpServer())
      .delete(`/api/guardians/${guardianId}`)
      .set('cookie', sessionCookieB)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/guardians/${guardianId}`)
      .set('cookie', sessionCookieA)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/cameras/${cameraId}`)
      .set('cookie', sessionCookieB)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/cameras/${cameraId}`)
      .set('cookie', sessionCookieA)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/residents/${residentId}`)
      .set('cookie', sessionCookieB)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/residents/${residentId}`)
      .set('cookie', sessionCookieA)
      .expect(200);
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

  it('filters by ACKED status and honors explicit limit', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/alerts?residentId=${resA_id}&limit=1`)
      .set('cookie', sessionCookieA)
      .expect(200);
    const alerts = list.body as Array<{ id: string }>;
    expect(alerts.length).toBeLessThanOrEqual(1);
    if (!alerts.length) return;

    await request(app.getHttpServer())
      .patch(`/api/alerts/${alerts[0].id}/ack`)
      .set('cookie', sessionCookieA)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/alerts?status=ACKED&limit=1')
      .set('cookie', sessionCookieA)
      .expect(200);
    const body = res.body as Array<{ status: string }>;
    expect(body.length).toBeLessThanOrEqual(1);
    expect(body.every((a) => a.status === 'ACKED')).toBe(true);
  });
});
// ─── AC7-backward: beforeSeq backward pagination ──────────────────────────────

describe('AC7-backward — /alerts beforeSeq backward cursor', () => {
  it('returns only alerts with alertSeq < beforeSeq in desc order', async () => {
    const all = await request(app.getHttpServer())
      .get('/api/alerts')
      .set('cookie', sessionCookieA)
      .expect(200);
    const allAlerts = all.body as Array<{ alertSeq: string }>;
    if (allAlerts.length < 2) return; // not enough data; skip

    // Pick a middle cursor
    const cursorIdx = Math.floor(allAlerts.length / 2);
    const cursor = allAlerts[cursorIdx].alertSeq;

    const res = await request(app.getHttpServer())
      .get(`/api/alerts?beforeSeq=${cursor}`)
      .set('cookie', sessionCookieA)
      .expect(200);
    const page = res.body as Array<{ alertSeq: string; orgId: string }>;

    // Every returned alert must be strictly older than the cursor.
    expect(page.length).toBeGreaterThan(0);
    expect(page.every((a) => BigInt(a.alertSeq) < BigInt(cursor))).toBe(true);
    // Org scope preserved.
    expect(page.every((a) => a.orgId === ORG_A)).toBe(true);
    // Still ordered desc.
    for (let i = 1; i < page.length; i++) {
      expect(BigInt(page[i - 1].alertSeq) >= BigInt(page[i].alertSeq)).toBe(
        true,
      );
    }
  });

  it('returns empty when beforeSeq is at or below the minimum alertSeq', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/alerts?beforeSeq=1')
      .set('cookie', sessionCookieA)
      .expect(200);
    const page = res.body as Array<{ alertSeq: string }>;
    // Either empty or (all seqs < 1 which is impossible) ← expect empty.
    expect(page.every((a) => BigInt(a.alertSeq) < 1n)).toBe(true);
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

  it('GET /api/sse replays Last-Event-ID backlog and emits status snapshot over HTTP', async () => {
    const t = Date.now();
    const firstDetectedAt = new Date(t - 2_000).toISOString();
    const first = await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: resA_id,
          facility_id: ORG_A,
          type: 'SSE_REPLAY_FIRST',
          detected_at: firstDetectedAt,
        }),
      )
      .send({
        resident_id: resA_id,
        facility_id: ORG_A,
        probability: 0.9,
        snapshot_url: null,
        detected_at: firstDetectedAt,
        type: 'SSE_REPLAY_FIRST',
      })
      .expect(201);
    const secondDetectedAt = new Date(t - 1_000).toISOString();
    const second = await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: resA_id,
          facility_id: ORG_A,
          type: 'SSE_REPLAY_SECOND',
          detected_at: secondDetectedAt,
        }),
      )
      .send({
        resident_id: resA_id,
        facility_id: ORG_A,
        probability: 0.9,
        snapshot_url: null,
        detected_at: secondDetectedAt,
        type: 'SSE_REPLAY_SECOND',
      })
      .expect(201);

    const firstSeq = (first.body as { alertSeq: string }).alertSeq;
    const secondSeq = (second.body as { alertSeq: string }).alertSeq;
    const stream = await readSseUntil(
      sessionCookieA,
      firstSeq,
      (body) =>
        body.includes(`id: ${secondSeq}`) &&
        body.includes('event: status-snapshot'),
    );

    expect(stream.statusCode).toBe(200);
    expect(stream.headers['x-accel-buffering']).toBe('no');
    expect(stream.body).toContain(`id: ${secondSeq}`);
    expect(stream.body).toContain('SSE_REPLAY_SECOND');
    expect(stream.body).toContain('event: status-snapshot');
    expect(stream.body).not.toContain(ORG_B);
  }, 10_000);
});

// ─── F5: Snapshot upload/proxy ────────────────────────────────────────────────

describe('F5 — snapshot upload and proxy', () => {
  async function createOrgAAlert(): Promise<string> {
    const detectedAt = new Date().toISOString();
    const body = {
      resident_id: resA_id,
      facility_id: ORG_A,
      probability: 0.95,
      snapshot_url: 'http://169.254.169.254/latest/meta-data',
      detected_at: detectedAt,
      type: `SNAPSHOT_${Date.now()}`,
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
    return (res.body as { id: string }).id;
  }

  it('stores authenticated snapshot bytes under a server-derived key and proxies them', async () => {
    const alertId = await createOrgAAlert();
    const upload = await request(app.getHttpServer())
      .put(`/api/snapshots/${alertId}`)
      .set('cookie', sessionCookieA)
      .set('content-type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
      .expect(201);

    const snapshotKey = (upload.body as { snapshotKey: string }).snapshotKey;
    expect(snapshotKey).toContain(ORG_A);
    expect(snapshotKey).not.toContain('169.254.169.254');

    await request(app.getHttpServer())
      .get(`/api/snapshots/${alertId}`)
      .set('cookie', sessionCookieA)
      .expect('content-type', /image\/jpeg/)
      .expect(200);
  });

  it('rejects cross-org snapshot access and stored path traversal keys', async () => {
    const alertId = await createOrgAAlert();

    await request(app.getHttpServer())
      .put(`/api/snapshots/${alertId}`)
      .set('cookie', sessionCookieB)
      .set('content-type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
      .expect(404);

    fs.writeFileSync(OUTSIDE_SNAPSHOT, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await direct.alert.update({
      where: { id: alertId },
      data: {
        snapshotKey: `../${OUTSIDE_SNAPSHOT.split('/').pop() ?? 'outside.jpg'}`,
      },
    });

    await request(app.getHttpServer())
      .get(`/api/snapshots/${alertId}`)
      .set('cookie', sessionCookieA)
      .expect(404);
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

  it('rejects malformed signature length → 401', async () => {
    const body = validBody();
    const headers = makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
      resident_id: body.resident_id,
      facility_id: body.facility_id,
      type: body.type,
      detected_at: body.detected_at,
    });
    headers['x-signature'] = 'deadbeef';
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(headers)
      .send(body)
      .expect(401);
  });

  it('rejects malformed X-Ingest-Timestamp → 400', async () => {
    const body = validBody();
    const headers = makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
      resident_id: body.resident_id,
      facility_id: body.facility_id,
      type: body.type,
      detected_at: body.detected_at,
    });
    headers['x-ingest-timestamp'] = 'not-a-date';
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(headers)
      .send(body)
      .expect(400);
  });

  it('rejects future detected_at → 400', async () => {
    const body = {
      ...validBody(),
      detected_at: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
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

  it('rejects invalid detected_at and probability contract values → 400', async () => {
    const invalidDateBody = { ...validBody(), detected_at: 'not-a-date' };
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: invalidDateBody.resident_id,
          facility_id: invalidDateBody.facility_id,
          type: invalidDateBody.type,
          detected_at: invalidDateBody.detected_at,
        }),
      )
      .send(invalidDateBody)
      .expect(400);

    const invalidProbabilityBody = { ...validBody(), probability: 1.5 };
    await request(app.getHttpServer())
      .post('/ingest/alerts')
      .set(
        makeIngestHeaders(CAM_A_KEYID, CAM_A_SECRET, {
          resident_id: invalidProbabilityBody.resident_id,
          facility_id: invalidProbabilityBody.facility_id,
          type: invalidProbabilityBody.type,
          detected_at: invalidProbabilityBody.detected_at,
        }),
      )
      .send(invalidProbabilityBody)
      .expect(400);
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
