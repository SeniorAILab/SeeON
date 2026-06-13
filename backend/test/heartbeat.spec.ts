/**
 * Camera heartbeat + cameraOnline decay integration tests.
 *
 * POST /ingest/heartbeat (HMAC-authenticated):
 *   - Updates Camera.lastSeenAt + Camera.online = true
 *   - Upserts ResidentStatus.cameraOnline = true + lastSeenAt = now
 *
 * 30 s decay: reading ResidentStatus after manually backdating lastSeenAt
 * returns cameraOnline = false.
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
import { StatusService } from '../src/status/status.service';

function hmacSha256hex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function heartbeatHeaders(keyId: string, secret: string) {
  // Heartbeat has no body → canonical = "|||"
  const canonical = '|||';
  const signature = hmacSha256hex(secret, canonical);
  return {
    'x-ingest-key-id': keyId,
    'x-signature': signature,
    'x-ingest-timestamp': Date.now().toString(),
  };
}

const ORG = `hb-org-${Date.now()}`;
const CAM_KEYID = `hb-cam-${Date.now()}`;
const CAM_SECRET = crypto.randomBytes(16).toString('hex');
let residentId: string;
let cameraId: string;
let statusService: StatusService;
let direct: PrismaClient;
let app: INestApplication<App>;

beforeAll(async () => {
  process.env.SESSION_JWT_SECRET = 'test-session-secret-minimum-32-characters';
  process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
  process.env.KAKAO_REDIRECT_URI = 'http://localhost:3001/auth/kakao/callback';

  direct = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  await direct.$connect();

  await direct.organization.create({
    data: { id: ORG, name: 'Heartbeat Test Org' },
  });

  const resident = await direct.resident.create({
    data: { id: `hb-res-${Date.now()}`, orgId: ORG, name: 'HB Resident' },
  });
  residentId = resident.id;

  const cam = await direct.camera.create({
    data: {
      id: `hb-cam-${Date.now()}`,
      orgId: ORG,
      residentId: resident.id,
      label: 'HB Camera',
      ingestKeyId: CAM_KEYID,
      ingestSecretHash: CAM_SECRET,
    },
  });
  cameraId = cam.id;

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

  statusService = app.get(StatusService);
}, 30_000);

afterAll(async () => {
  await direct.residentStatus.deleteMany({ where: { orgId: ORG } });
  await direct.camera.deleteMany({ where: { orgId: ORG } });
  await direct.resident.deleteMany({ where: { orgId: ORG } });
  await direct.organization.delete({ where: { id: ORG } }).catch(() => {});
  await app.close();
  await direct.$disconnect();
});

describe('POST /ingest/heartbeat', () => {
  it('returns 200 ok on valid HMAC heartbeat', async () => {
    const res = await request(app.getHttpServer())
      .post('/ingest/heartbeat')
      .set(heartbeatHeaders(CAM_KEYID, CAM_SECRET))
      .send({})
      .expect(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('sets cameraOnline = true after heartbeat', async () => {
    await request(app.getHttpServer())
      .post('/ingest/heartbeat')
      .set(heartbeatHeaders(CAM_KEYID, CAM_SECRET))
      .send({})
      .expect(200);

    const status = await statusService.getByResident(ORG, residentId);
    expect(status).not.toBeNull();
    expect(status!.cameraOnline).toBe(true);
  });

  it('cameraOnline decays to false when lastSeenAt > 30 s ago', async () => {
    // First send a heartbeat so the row exists with cameraOnline=true.
    await request(app.getHttpServer())
      .post('/ingest/heartbeat')
      .set(heartbeatHeaders(CAM_KEYID, CAM_SECRET))
      .send({})
      .expect(200);

    // Backdate lastSeenAt via direct DB connection (bypasses RLS).
    await direct.residentStatus.update({
      where: { residentId },
      data: { lastSeenAt: new Date(Date.now() - 31_000) },
    });

    // Reading via StatusService should apply the 30 s decay.
    const status = await statusService.getByResident(ORG, residentId);
    expect(status!.cameraOnline).toBe(false);
  });

  it('rejects tampered signature → 401', async () => {
    const headers = heartbeatHeaders(CAM_KEYID, CAM_SECRET);
    headers['x-signature'] = 'deadbeef'.repeat(8);
    await request(app.getHttpServer())
      .post('/ingest/heartbeat')
      .set(headers)
      .send({})
      .expect(401);
  });

  it('rejects unknown key-id → 401', async () => {
    const canonical = '|||';
    const signature = hmacSha256hex('any-secret', canonical);
    await request(app.getHttpServer())
      .post('/ingest/heartbeat')
      .set({
        'x-ingest-key-id': 'unknown-key',
        'x-signature': signature,
        'x-ingest-timestamp': Date.now().toString(),
      })
      .send({})
      .expect(401);
  });

  it('updates Camera.lastSeenAt on heartbeat', async () => {
    const before = await direct.camera.findUnique({ where: { id: cameraId } });
    const beforeTs = before?.lastSeenAt?.getTime() ?? 0;

    await new Promise((r) => setTimeout(r, 10)); // ensure time advances

    await request(app.getHttpServer())
      .post('/ingest/heartbeat')
      .set(heartbeatHeaders(CAM_KEYID, CAM_SECRET))
      .send({})
      .expect(200);

    const after = await direct.camera.findUnique({ where: { id: cameraId } });
    expect(after?.lastSeenAt?.getTime() ?? 0).toBeGreaterThan(beforeTs);
    expect(after?.online).toBe(true);
  });
});
