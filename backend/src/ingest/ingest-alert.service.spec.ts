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
    Promise<{
      alertSeq: bigint;
      id: string;
      resident?: { name: string; room: string | null } | null;
      space?: { name: string } | null;
    }>,
    [WriteAlertInput]
  >();
  const withFacilityContext = jest.fn() as jest.MockedFunction<
    PrismaService['withFacilityContext']
  >;
  const ensureOutboxForIngest = jest.fn() as jest.MockedFunction<
    AlertEventsService['ensureOutboxForIngest']
  >;
  const writer = { writeAlert } as unknown as AlertWriterService;
  const prisma = { withFacilityContext } as unknown as PrismaService;
  const alertEventsService = {
    ensureOutboxForIngest,
  } as unknown as AlertEventsService;
  return {
    service: new IngestAlertService(writer, prisma, alertEventsService),
    writeAlert,
    withFacilityContext,
    ensureOutboxForIngest,
  };
}

function camera(overrides: Partial<IngestCameraInfo> = {}): IngestCameraInfo {
  return {
    id: 'cam-1',
    facilityId: 'facility-1',
    spaceId: 'space-1',
    ingestKeyId: 'key-1',
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return parseIngestAlertBody({
    resident_id: 'res-1',
    facility_id: 'facility-1',
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
        facility_id: 'facility-1',
        probability: '0.75',
        detected_at: NOW.toISOString(),
        type: 'fall',
      }),
    ).toEqual({
      resident_id: '123',
      facility_id: 'facility-1',
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
      service.ingestAlert(camera(), body({ facility_id: 'other-facility' })),
    ).rejects.toBeInstanceOf(TenantMismatchException);
  });

  it('does not require the ingest resident_id to match legacy camera residentId', async () => {
    const { service, writeAlert } = setup();
    writeAlert.mockResolvedValue({
      alertSeq: 7n,
      id: 'a1',
      resident: null,
      space: { name: 'Room 101' },
    });

    await expect(
      service.ingestAlert(camera(), body({ resident_id: 'other-resident' })),
    ).resolves.toEqual({ alertSeq: '7', id: 'a1', status: 'created' });
  });

  it('writes created alerts with idempotency, outbox, and threaded resident context', async () => {
    const { service, writeAlert, ensureOutboxForIngest } = setup();
    writeAlert.mockResolvedValue({
      alertSeq: 7n,
      id: 'a1',
      resident: { name: '홍길동', room: '302호' },
      space: { name: '402호' },
    });

    const result = await service.ingestAlert(camera(), body());

    expect(result).toEqual({ alertSeq: '7', id: 'a1', status: 'created' });
    expect(writeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        facilityId: 'facility-1',
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
    // AC8: resident name/room from the alert-writer join thread to the outbox
    // without changing the ML ingest DTO.
    expect(ensureOutboxForIngest).toHaveBeenCalledWith({
      facilityId: 'facility-1',
      sourceId: 'cam-1',
      externalEventId: idempotencyKey,
      type: 'fall',
      detectedAt: NOW,
      confidence: 0.9,
      residentName: '홍길동',
      residentRoom: '402호',
    });
  });

  it('accepts bed-exit ingest and ensures an alert event outbox', async () => {
    const { service, writeAlert, ensureOutboxForIngest } = setup();
    writeAlert.mockResolvedValue({
      alertSeq: 8n,
      id: 'bed-exit-alert-1',
      resident: { name: '김영희', room: null },
      space: { name: '재활실' },
    });

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
      facilityId: 'facility-1',
      sourceId: 'cam-1',
      externalEventId: idempotencyKey,
      type: 'bed-exit',
      detectedAt: NOW,
      confidence: 0.1,
      residentName: '김영희',
      residentRoom: '재활실',
    });
  });

  it('returns duplicate status on P2002 and threads resident context from the existing alert', async () => {
    const { service, writeAlert, withFacilityContext, ensureOutboxForIngest } =
      setup();
    writeAlert.mockRejectedValue({ code: 'P2002' });
    withFacilityContext.mockImplementation((_facilityId: string, cb) =>
      cb({
        alert: {
          findFirst: () => ({
            alertSeq: 3n,
            id: 'a-dup',
            resident: { name: '박철수', room: '101호' },
            space: { name: '201호' },
          }),
        },
      } as unknown as Parameters<typeof cb>[0]),
    );

    const result = await service.ingestAlert(camera(), body());

    expect(result).toEqual({ alertSeq: '3', id: 'a-dup', status: 'duplicate' });
    const idempotencyKey = writeAlert.mock.calls[0][0].idempotencyKey;
    expect(withFacilityContext).toHaveBeenCalledWith(
      'facility-1',
      expect.any(Function),
    );
    // AC8 duplicate-repair: the existing alert's resident still threads through.
    expect(ensureOutboxForIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        facilityId: 'facility-1',
        sourceId: 'cam-1',
        externalEventId: idempotencyKey,
        confidence: 0.9,
        residentName: '박철수',
        residentRoom: '201호',
      }),
    );
  });
});
