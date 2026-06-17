import { BadRequestException } from '@nestjs/common';

import {
  MissingFieldException,
  TenantMismatchException,
} from '../common/domain-errors';
import {
  AlertWriterService,
  type WriteAlertInput,
} from '../alerts/alert-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CamerasService } from '../cameras/cameras.service';
import { StatusService } from '../status/status.service';
import { AlertEventsService } from '../alerts/services/alert-events.service';
import { IngestController } from './ingest.controller';
import type { RequestWithIngestCamera } from './hmac.guard';

function setup() {
  const writeAlert = jest.fn<
    Promise<{ alertSeq: bigint; id: string }>,
    [WriteAlertInput]
  >();
  const withOrgContext = jest.fn() as jest.MockedFunction<
    PrismaService['withOrgContext']
  >;
  const recordHeartbeat = jest.fn();
  const recordCameraHeartbeat = jest.fn();
  const ensureOutboxForIngest = jest.fn() as jest.MockedFunction<
    AlertEventsService['ensureOutboxForIngest']
  >;
  const writer = { writeAlert } as unknown as AlertWriterService;
  const prisma = { withOrgContext } as unknown as PrismaService;
  const cameras = { recordHeartbeat } as unknown as CamerasService;
  const status = { recordCameraHeartbeat } as unknown as StatusService;
  const alertEventsService = {
    ensureOutboxForIngest,
  } as unknown as AlertEventsService;
  return {
    controller: new IngestController(
      writer,
      prisma,
      cameras,
      status,
      alertEventsService,
    ),
    writer,
    prisma,
    alertEventsService,
    writeAlert,
    withOrgContext,
    ensureOutboxForIngest,
  };
}

function req(): RequestWithIngestCamera {
  return {
    ingestCamera: {
      id: 'cam-1',
      orgId: 'org-1',
      residentId: 'res-1',
      ingestKeyId: 'key-1',
    },
  } as unknown as RequestWithIngestCamera;
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    resident_id: 'res-1',
    facility_id: 'org-1',
    probability: 0.9,
    detected_at: new Date().toISOString(),
    type: 'fall',
    ...overrides,
  };
}

describe('IngestController', () => {
  it('rejects payloads missing a required field', async () => {
    const { controller } = setup();
    await expect(
      controller.ingestAlert(req(), body({ probability: undefined })),
    ).rejects.toBeInstanceOf(MissingFieldException);
  });

  it('rejects an out-of-range probability', async () => {
    const { controller } = setup();
    await expect(
      controller.ingestAlert(req(), body({ probability: 1.5 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects facility_id that does not match the verified camera org', async () => {
    const { controller } = setup();
    await expect(
      controller.ingestAlert(req(), body({ facility_id: 'other-org' })),
    ).rejects.toBeInstanceOf(TenantMismatchException);
  });

  it('writes the alert with a server-derived idempotency key', async () => {
    const { controller, writeAlert, ensureOutboxForIngest } = setup();
    writeAlert.mockResolvedValue({
      alertSeq: 7n,
      id: 'a1',
    });
    const result = await controller.ingestAlert(req(), body());
    expect(result).toEqual({ alertSeq: '7', id: 'a1', status: 'created' });
    const arg = writeAlert.mock.calls[0][0];
    expect(arg.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.snapshotKey).toBeNull();
    expect(ensureOutboxForIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        sourceId: 'cam-1',
        externalEventId: arg.idempotencyKey,
        confidence: 0.9,
      }),
    );
  });

  it('returns duplicate status on a unique-constraint collision', async () => {
    const { controller, writeAlert, withOrgContext, ensureOutboxForIngest } =
      setup();
    writeAlert.mockRejectedValue({ code: 'P2002' });
    withOrgContext.mockImplementation((_o: string, cb) =>
      cb({
        alert: { findFirst: () => ({ alertSeq: 3n, id: 'a-dup' }) },
      } as unknown as Parameters<typeof cb>[0]),
    );
    const result = await controller.ingestAlert(req(), body());
    expect(result).toEqual({ alertSeq: '3', id: 'a-dup', status: 'duplicate' });
    expect(ensureOutboxForIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        sourceId: 'cam-1',
        confidence: 0.9,
      }),
    );
  });
});
