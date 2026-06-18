import { BadRequestException } from '@nestjs/common';

import {
  AlertWriterService,
  type WriteAlertInput,
} from '../alerts/alert-writer.service';
import { AlertEventsService } from '../alerts/services/alert-events.service';
import {
  MissingFieldException,
  StaleTimestampException,
  TenantMismatchException,
} from '../common/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { IngestCameraInfo } from './hmac.guard';
import { IngestAlertService } from './ingest-alert.service';
import { parseIngestAlertBody } from './dto/ingest-alert.dto';

const NOW = new Date('2026-06-18T00:00:00.000Z');

function setup() {
  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  const writeAlert = jest.fn<
    Promise<{ alertSeq: bigint; id: string }>,
    [WriteAlertInput]
  >();
  const withOrgContext = jest.fn() as jest.MockedFunction<
    PrismaService['withOrgContext']
  >;
  const ensureOutboxForIngest = jest.fn() as jest.MockedFunction<
    AlertEventsService['ensureOutboxForIngest']
  >;
  const writer = { writeAlert } as unknown as AlertWriterService;
  const prisma = { withOrgContext } as unknown as PrismaService;
  const alertEventsService = {
    ensureOutboxForIngest,
  } as unknown as AlertEventsService;
  return {
    service: new IngestAlertService(writer, prisma, alertEventsService),
    writeAlert,
    withOrgContext,
    ensureOutboxForIngest,
  };
}

function camera(overrides: Partial<IngestCameraInfo> = {}): IngestCameraInfo {
  return {
    id: 'cam-1',
    orgId: 'org-1',
    residentId: 'res-1',
    ingestKeyId: 'key-1',
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return parseIngestAlertBody({
    resident_id: 'res-1',
    facility_id: 'org-1',
    probability: 0.9,
    detected_at: NOW.toISOString(),
    type: 'fall',
    ...overrides,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('parseIngestAlertBody', () => {
  it('coerces a valid ingest alert body', () => {
    expect(
      parseIngestAlertBody({
        resident_id: 123,
        facility_id: 'org-1',
        probability: '0.75',
        detected_at: NOW.toISOString(),
        type: 'fall',
      }),
    ).toEqual({
      resident_id: '123',
      facility_id: 'org-1',
      probability: 0.75,
      detectedAt: NOW,
      type: 'fall',
    });
  });

  it('accepts bed-exit alert type', () => {
    expect(body({ type: 'bed-exit' })).toEqual(
      expect.objectContaining({
        type: 'bed-exit',
      }),
    );
  });

  it('rejects unknown alert types', () => {
    expect(() => body({ type: 'foo' })).toThrow(BadRequestException);
  });

  it('rejects missing required fields', () => {
    expect(() => body({ resident_id: '' })).toThrow(MissingFieldException);
  });

  it('rejects invalid probability', () => {
    expect(() => body({ probability: 1.5 })).toThrow(BadRequestException);
  });

  it('rejects invalid detected_at', () => {
    expect(() => body({ detected_at: 'not-a-date' })).toThrow(
      BadRequestException,
    );
  });
});

describe('IngestAlertService', () => {
  it('rejects stale detected_at values', async () => {
    const { service } = setup();

    await expect(
      service.ingestAlert(
        camera(),
        body({ detected_at: new Date(NOW.getTime() - 301_000).toISOString() }),
      ),
    ).rejects.toBeInstanceOf(StaleTimestampException);
  });

  it('rejects tenant facility mismatches', async () => {
    const { service } = setup();

    await expect(
      service.ingestAlert(camera(), body({ facility_id: 'other-org' })),
    ).rejects.toBeInstanceOf(TenantMismatchException);
  });

  it('rejects assigned resident mismatches', async () => {
    const { service } = setup();

    await expect(
      service.ingestAlert(camera(), body({ resident_id: 'other-resident' })),
    ).rejects.toBeInstanceOf(TenantMismatchException);
  });

  it('writes created alerts with server-derived idempotency and outbox', async () => {
    const { service, writeAlert, ensureOutboxForIngest } = setup();
    writeAlert.mockResolvedValue({ alertSeq: 7n, id: 'a1' });

    const result = await service.ingestAlert(camera(), body());

    expect(result).toEqual({ alertSeq: '7', id: 'a1', status: 'created' });
    expect(writeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        residentId: 'res-1',
        cameraId: 'cam-1',
        type: 'fall',
        probability: 0.9,
        snapshotKey: null,
        detectedAt: NOW,
      }),
    );
    const idempotencyKey = writeAlert.mock.calls[0][0].idempotencyKey;
    expect(idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(ensureOutboxForIngest).toHaveBeenCalledWith({
      orgId: 'org-1',
      sourceId: 'cam-1',
      externalEventId: idempotencyKey,
      type: 'fall',
      detectedAt: NOW,
      confidence: 0.9,
    });
  });

  it('accepts bed-exit ingest and ensures an alert event outbox', async () => {
    const { service, writeAlert, ensureOutboxForIngest } = setup();
    writeAlert.mockResolvedValue({ alertSeq: 8n, id: 'bed-exit-alert-1' });

    const result = await service.ingestAlert(
      camera(),
      body({ type: 'bed-exit', probability: 0.1 }),
    );

    expect(result).toEqual({
      alertSeq: '8',
      id: 'bed-exit-alert-1',
      status: 'created',
    });
    expect(writeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bed-exit',
        probability: 0.1,
      }),
    );
    const idempotencyKey = writeAlert.mock.calls[0][0].idempotencyKey;
    expect(ensureOutboxForIngest).toHaveBeenCalledWith({
      orgId: 'org-1',
      sourceId: 'cam-1',
      externalEventId: idempotencyKey,
      type: 'bed-exit',
      detectedAt: NOW,
      confidence: 0.1,
    });
  });

  it('returns duplicate status on P2002 and ensures outbox', async () => {
    const { service, writeAlert, withOrgContext, ensureOutboxForIngest } =
      setup();
    writeAlert.mockRejectedValue({ code: 'P2002' });
    withOrgContext.mockImplementation((_orgId: string, cb) =>
      cb({
        alert: { findFirst: () => ({ alertSeq: 3n, id: 'a-dup' }) },
      } as unknown as Parameters<typeof cb>[0]),
    );

    const result = await service.ingestAlert(camera(), body());

    expect(result).toEqual({ alertSeq: '3', id: 'a-dup', status: 'duplicate' });
    const idempotencyKey = writeAlert.mock.calls[0][0].idempotencyKey;
    expect(withOrgContext).toHaveBeenCalledWith('org-1', expect.any(Function));
    expect(ensureOutboxForIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        sourceId: 'cam-1',
        externalEventId: idempotencyKey,
        confidence: 0.9,
      }),
    );
  });
});
