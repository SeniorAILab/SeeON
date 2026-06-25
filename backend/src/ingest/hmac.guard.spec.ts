import type { ExecutionContext } from '@nestjs/common';
import * as crypto from 'crypto';

import {
  InvalidSignatureException,
  StaleTimestampException,
  UnknownIngestKeyException,
} from '../common/domain-errors';
import type { PrismaService } from '../prisma/prisma.service';
import { HmacIngestGuard } from './hmac.guard';

const SECRET = 'camera-hmac-secret';

function makeGuard(rows: unknown[]) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(rows),
  } as unknown as PrismaService;
  return new HmacIngestGuard(prisma);
}

function ctx(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function sign(body: Record<string, unknown>): string {
  return signWithKey(body, SECRET);
}

function signWithKey(body: Record<string, unknown>, key: string): string {
  const canonical = [
    body.resident_id,
    body.facility_id,
    body.type,
    body.detected_at,
  ]
    .map((v) => {
      if (v === undefined || v === null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      return '';
    })
    .join('|');
  return crypto.createHmac('sha256', key).update(canonical).digest('hex');
}

const cameraRow = {
  id: 'cam-1',
  facilityId: 'facility-1',
  spaceId: 'space-1',
  ingestKeyId: 'key-1',
  ingestSecretHash: SECRET,
};

function validRequest() {
  const body = {
    resident_id: 'res-1',
    facility_id: 'facility-1',
    type: 'fall',
    detected_at: '2026-06-16T10:00:00.000Z',
  };
  return {
    headers: {
      'x-ingest-key-id': 'key-1',
      'x-signature': sign(body),
      'x-ingest-timestamp': String(Date.now()),
    },
    body,
  };
}
function roomOnlyRequest() {
  const body = {
    facility_id: 'facility-1',
    type: 'fall',
    detected_at: '2026-06-16T10:00:00.000Z',
  };
  return {
    headers: {
      'x-ingest-key-id': 'key-1',
      'x-signature': sign(body),
      'x-ingest-timestamp': String(Date.now()),
    },
    body,
  };
}

describe('HmacIngestGuard', () => {
  it('rejects requests missing auth headers', async () => {
    const guard = makeGuard([cameraRow]);
    await expect(
      guard.canActivate(ctx({ headers: {}, body: {} })),
    ).rejects.toBeInstanceOf(InvalidSignatureException);
  });

  it('rejects stale timestamps outside the freshness window', async () => {
    const guard = makeGuard([cameraRow]);
    const req = validRequest();
    req.headers['x-ingest-timestamp'] = String(Date.now() - 10 * 60 * 1000);
    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(
      StaleTimestampException,
    );
  });

  it('rejects unknown ingest keys', async () => {
    const guard = makeGuard([]);
    await expect(guard.canActivate(ctx(validRequest()))).rejects.toBeInstanceOf(
      UnknownIngestKeyException,
    );
  });

  it('rejects a tampered signature', async () => {
    const guard = makeGuard([cameraRow]);
    const req = validRequest();
    req.headers['x-signature'] = 'deadbeef'.repeat(8);
    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(
      InvalidSignatureException,
    );
  });
  it('rejects a tampered room-only signature', async () => {
    const guard = makeGuard([cameraRow]);
    const req = roomOnlyRequest();
    req.headers['x-signature'] = sign({ ...req.body, resident_id: 'res-1' });
    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(
      InvalidSignatureException,
    );
  });

  it('accepts a valid signature and attaches the verified camera', async () => {
    const guard = makeGuard([cameraRow]);
    const req = validRequest() as ReturnType<typeof validRequest> & {
      ingestCamera?: unknown;
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.ingestCamera).toEqual({
      id: 'cam-1',
      facilityId: 'facility-1',
      spaceId: 'space-1',
      ingestKeyId: 'key-1',
    });
  });

  it('accepts a signature from the one-time camera create secret contract', async () => {
    const oneTimeSecret = 'operator-provisioned-worker-secret';
    const storedHmacKey = crypto
      .createHash('sha256')
      .update(oneTimeSecret)
      .digest('hex');
    const row = { ...cameraRow, ingestSecretHash: storedHmacKey };
    const guard = makeGuard([row]);
    const req = validRequest();
    req.headers['x-signature'] = signWithKey(req.body, storedHmacKey);

    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
  });

  it('accepts a v1 signature with an empty resident_id field for room-only alerts', async () => {
    const guard = makeGuard([cameraRow]);
    const req = roomOnlyRequest() as ReturnType<typeof roomOnlyRequest> & {
      ingestCamera?: unknown;
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.ingestCamera).toEqual({
      id: 'cam-1',
      facilityId: 'facility-1',
      spaceId: 'space-1',
      ingestKeyId: 'key-1',
    });
  });
});
