import { BadRequestException } from '@nestjs/common';

import {
  MissingFieldException,
  TenantMismatchException,
} from '../common/domain-errors';
import { AlertWriterService } from '../alerts/alert-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CamerasService } from '../cameras/cameras.service';
import { StatusService } from '../status/status.service';
import { IngestController } from './ingest.controller';
import type { RequestWithIngestCamera } from './hmac.guard';

function setup() {
  const writer = { writeAlert: jest.fn() } as unknown as AlertWriterService;
  const prisma = { withOrgContext: jest.fn() } as unknown as PrismaService;
  const cameras = { recordHeartbeat: jest.fn() } as unknown as CamerasService;
  const status = {
    recordCameraHeartbeat: jest.fn(),
  } as unknown as StatusService;
  return {
    controller: new IngestController(writer, prisma, cameras, status),
    writer,
    prisma,
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
    const { controller, writer } = setup();
    (writer.writeAlert as jest.Mock).mockResolvedValue({
      alertSeq: 7n,
      id: 'a1',
    });
    const result = await controller.ingestAlert(req(), body());
    expect(result).toEqual({ alertSeq: '7', id: 'a1', status: 'created' });
    const arg = (writer.writeAlert as jest.Mock).mock.calls[0][0];
    expect(arg.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.snapshotKey).toBeNull();
  });

  it('returns duplicate status on a unique-constraint collision', async () => {
    const { controller, writer, prisma } = setup();
    (writer.writeAlert as jest.Mock).mockRejectedValue({ code: 'P2002' });
    (prisma.withOrgContext as jest.Mock).mockImplementation(
      (_o: string, cb: (tx: unknown) => unknown) =>
        cb({
          alert: { findFirst: () => ({ alertSeq: 3n, id: 'a-dup' }) },
        }),
    );
    const result = await controller.ingestAlert(req(), body());
    expect(result).toEqual({ alertSeq: '3', id: 'a-dup', status: 'duplicate' });
  });
});
