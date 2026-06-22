import { BadRequestException } from '@nestjs/common';

import { CamerasService } from '../cameras/cameras.service';
import { IngestController } from './ingest.controller';
import { IngestAlertService } from './ingest-alert.service';
import type { RequestWithIngestCamera } from './hmac.guard';

function setup() {
  const recordHeartbeat = jest.fn();
  const ingestAlert = jest.fn();
  const cameras = { recordHeartbeat } as unknown as CamerasService;
  const ingestAlertService = { ingestAlert } as unknown as IngestAlertService;
  return {
    controller: new IngestController(cameras, ingestAlertService),
    ingestAlert,
    recordHeartbeat,
  };
}

function req(): RequestWithIngestCamera {
  return {
    ingestCamera: {
      id: 'cam-1',
      facilityId: 'facility-1',
      spaceId: 'space-1',
      ingestKeyId: 'key-1',
    },
  } as unknown as RequestWithIngestCamera;
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    resident_id: 'res-1',
    facility_id: 'facility-1',
    probability: '0.9',
    detected_at: new Date().toISOString(),
    type: 'fall',
    ...overrides,
  };
}

describe('IngestController', () => {
  it('parses the alert body and delegates ingest to IngestAlertService', async () => {
    const { controller, ingestAlert } = setup();
    ingestAlert.mockResolvedValue({
      alertSeq: '7',
      id: 'a1',
      status: 'created',
    });

    const request = req();
    const payload = body();
    const result = await controller.ingestAlert(request, payload);

    expect(result).toEqual({ alertSeq: '7', id: 'a1', status: 'created' });
    expect(ingestAlert).toHaveBeenCalledWith(
      request.ingestCamera,
      expect.objectContaining({
        resident_id: 'res-1',
        facility_id: 'facility-1',
        probability: 0.9,
        type: 'fall',
      }),
    );
    const firstCall = ingestAlert.mock.calls[0] as unknown[] | undefined;
    const parsedArg = firstCall?.[1] as { detectedAt: Date };
    expect(parsedArg.detectedAt).toBeInstanceOf(Date);
  });

  it('requires ingest camera context', async () => {
    const { controller, ingestAlert } = setup();

    await expect(
      controller.ingestAlert({} as RequestWithIngestCamera, body()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ingestAlert).not.toHaveBeenCalled();
  });

  it('keeps heartbeat behavior in the controller without resident status writes', async () => {
    const { controller, recordHeartbeat } = setup();

    await expect(controller.heartbeat(req())).resolves.toEqual({ ok: true });
    expect(recordHeartbeat).toHaveBeenCalledWith('facility-1', 'cam-1');
  });
});
