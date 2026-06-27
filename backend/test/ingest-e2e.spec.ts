import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

import { AlertWriterService } from '../src/alerts/alert-writer.service';
import { AppModule } from '../src/app.module';

/**
 * Runtime e2e for the canonical alert ingress (#216 / ADR-043, ADR-047).
 * Exercises the full refactored pipeline over real HTTP + the live DB:
 *   POST /ingest/alerts (HMAC) -> IngestAlertService -> AlertWriterService.writeAlert
 *   (Alert read-model + ResidentStatus + SSE) AND AlertEventsService.ensureOutboxForIngest
 *   (AlertEvent + per-recipient DeliveryAttempt outbox).
 *
 * Kakao fan-out is intentionally empty here (no facility user holds an encrypted
 * talk_message token), which is the honest "Kakao delivery UNAVAILABLE" state —
 * the per-recipient send path is covered by alert-events.service unit tests.
 */
const FACILITY = 'e2e-ingest-facility';
const RES = 'e2e-ingest-res';
const CAM = 'e2e-ingest-cam';
const FLOOR = 'e2e-ingest-floor';
const SPACE = 'e2e-ingest-space';
const KEY_ID = 'e2e-ingest-keyid';
// The HMAC guard signs with camera.ingestSecretHash directly (see hmac.guard.ts),
// so any fixed key value works as long as the client signs with the same value.
const SECRET_HASH = 'e2e-ingest-secret-hash-key';

describe('ingest pipeline e2e (POST /ingest/alerts)', () => {
  let app: INestApplication;
  let direct: PrismaClient;

  async function cleanup(): Promise<void> {
    const events = await direct.alertEvent.findMany({
      where: { sourceId: CAM },
    });
    for (const e of events) {
      await direct.deliveryAttempt.deleteMany({
        where: { alertEventId: e.id },
      });
    }
    await direct.alertEvent.deleteMany({ where: { sourceId: CAM } });
    await direct.alert.deleteMany({ where: { facilityId: FACILITY } });
    await direct.residentStatus.deleteMany({ where: { facilityId: FACILITY } });
    await direct.camera.deleteMany({ where: { facilityId: FACILITY } });
    await direct.space.deleteMany({ where: { facilityId: FACILITY } });
    await direct.floor.deleteMany({ where: { facilityId: FACILITY } });
    await direct.resident.deleteMany({ where: { facilityId: FACILITY } });
    await direct.facility.deleteMany({ where: { id: FACILITY } });
  }

  beforeAll(async () => {
    if (!process.env.DIRECT_URL || !process.env.DATABASE_URL) {
      throw new Error(
        'DIRECT_URL and DATABASE_URL are required for ingest e2e',
      );
    }
    direct = new PrismaClient({
      datasources: { db: { url: process.env.DIRECT_URL } },
    });
    await cleanup();
    await direct.facility.create({
      data: {
        id: FACILITY,
        name: 'E2E Ingest Facility',
        code: 'e2e-ingest-facility',
      },
    });
    await direct.resident.create({
      data: {
        id: RES,
        facilityId: FACILITY,
        name: 'E2E Resident',
      },
    });
    await direct.floor.create({
      data: {
        id: FLOOR,
        facilityId: FACILITY,
        name: 'E2E Floor',
        orderIndex: 1,
      },
    });
    await direct.space.create({
      data: {
        id: SPACE,
        facilityId: FACILITY,
        floorId: FLOOR,
        name: 'E2E',
        type: 'ROOM',
        capacity: 1,
      },
    });
    await direct.camera.create({
      data: {
        id: CAM,
        facilityId: FACILITY,
        spaceId: SPACE,
        label: 'E2E Cam',
        ingestKeyId: KEY_ID,
        ingestSecretHash: SECRET_HASH,
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await cleanup();
    await direct.$disconnect();
    await app.close();
  });

  function signAlertBody(body: {
    resident_id?: string | null;
    facility_id: string;
    type: string;
    detected_at: string;
  }): string {
    return crypto
      .createHmac('sha256', SECRET_HASH)
      .update(
        [
          body.resident_id ?? '',
          body.facility_id,
          body.type,
          body.detected_at,
        ].join('|'),
      )
      .digest('hex');
  }

  it('creates Alert + ResidentStatus(FALL) + AlertEvent for a valid HMAC fall ingest', async () => {
    const detectedAt = new Date().toISOString();
    const body = {
      resident_id: RES,
      facility_id: FACILITY,
      probability: 0.95,
      detected_at: detectedAt,
      type: 'fall',
    };
    const signature = signAlertBody(body);

    const res = await request(app.getHttpServer() as App)
      .post('/ingest/alerts')
      .set('x-ingest-key-id', KEY_ID)
      .set('x-signature', signature)
      .set('x-ingest-timestamp', detectedAt)
      .send(body)
      .expect(201);
    expect((res.body as { status: string }).status).toBe('created');

    // Alert read-model row created, facility-scoped.
    const alerts = await direct.alert.findMany({
      where: { facilityId: FACILITY },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.residentId).toBe(RES);
    expect(alerts[0]?.cameraId).toBe(CAM);
    expect(alerts[0]?.probability).toBeCloseTo(0.95);

    // ResidentStatus read-model updated to FALL (probability >= 0.8).
    const status = await direct.residentStatus.findUnique({
      where: { residentId: RES },
    });
    expect(status?.state).toBe('FALL');

    // Outbox AlertEvent created for the same idempotent event.
    const events = await direct.alertEvent.findMany({
      where: { sourceId: CAM },
    });
    expect(events).toHaveLength(1);

    // No facility user holds a Kakao token -> per-user fan-out empty (Kakao UNAVAILABLE).
    const attempts = await direct.deliveryAttempt.findMany({
      where: { alertEventId: events[0]?.id },
    });
    expect(attempts.length).toBe(0);
  });
  it('returns duplicate for repeated legacy alert ingest without a second Alert or SSE emit', async () => {
    await direct.alert.deleteMany({ where: { facilityId: FACILITY } });
    await direct.residentStatus.deleteMany({ where: { facilityId: FACILITY } });
    await direct.alertEvent.deleteMany({ where: { sourceId: CAM } });

    const received: unknown[] = [];
    app.get(AlertWriterService).subscribe(FACILITY, (event) => received.push(event));

    const detectedAt = new Date().toISOString();
    const body = {
      resident_id: RES,
      facility_id: FACILITY,
      probability: 0.95,
      detected_at: detectedAt,
      type: 'fall',
    };
    const signature = signAlertBody(body);

    const first = await request(app.getHttpServer() as App)
      .post('/ingest/alerts')
      .set('x-ingest-key-id', KEY_ID)
      .set('x-signature', signature)
      .set('x-ingest-timestamp', detectedAt)
      .send(body)
      .expect(201);
    expect((first.body as { status: string }).status).toBe('created');

    const second = await request(app.getHttpServer() as App)
      .post('/ingest/alerts')
      .set('x-ingest-key-id', KEY_ID)
      .set('x-signature', signature)
      .set('x-ingest-timestamp', detectedAt)
      .send(body)
      .expect(201);
    expect((second.body as { status: string }).status).toBe('duplicate');
    expect((second.body as { id: string }).id).toBe((first.body as { id: string }).id);

    const alerts = await direct.alert.findMany({
      where: { facilityId: FACILITY },
    });
    expect(alerts).toHaveLength(1);
    expect(received).toHaveLength(1);
  });

  it('keeps the legacy HMAC heartbeat live', async () => {
    const detectedAt = new Date().toISOString();
    const signature = crypto
      .createHmac('sha256', SECRET_HASH)
      .update('|||')
      .digest('hex');

    await request(app.getHttpServer() as App)
      .post('/ingest/heartbeat')
      .set('x-ingest-key-id', KEY_ID)
      .set('x-signature', signature)
      .set('x-ingest-timestamp', detectedAt)
      .send({})
      .expect(200, { ok: true });

    const camera = await direct.camera.findUniqueOrThrow({ where: { id: CAM } });
    expect(camera.online).toBe(true);
    expect(camera.lastSeenAt).toBeInstanceOf(Date);
  });
  it('rejects an ingest request with an invalid HMAC signature (401)', async () => {
    const detectedAt = new Date().toISOString();
    await request(app.getHttpServer() as App)
      .post('/ingest/alerts')
      .set('x-ingest-key-id', KEY_ID)
      .set('x-signature', 'deadbeef')
      .set('x-ingest-timestamp', detectedAt)
      .send({
        resident_id: RES,
        facility_id: FACILITY,
        probability: 0.95,
        detected_at: detectedAt,
        type: 'fall',
      })
      .expect(401);
  });

  it('does not mount the removed legacy POST /api.alerts/events (404)', async () => {
    await request(app.getHttpServer() as App)
      .post('/api.alerts/events')
      .send({})
      .expect(404);
  });
});
