import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from './status.service';

type StatusDelegate = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  upsert: jest.Mock;
};

function setup() {
  const residentStatus: StatusDelegate = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  };
  const prisma = {
    withOrgContext: jest.fn(
      (
        _orgId: string,
        cb: (tx: { residentStatus: StatusDelegate }) => unknown,
      ) => cb({ residentStatus }),
    ),
  } as unknown as PrismaService;
  return { service: new StatusService(prisma), residentStatus };
}

describe('StatusService', () => {
  it('decays cameraOnline to false when lastSeenAt is older than 30s', async () => {
    const { service, residentStatus } = setup();
    residentStatus.findUnique.mockResolvedValue({
      residentId: 'r1',
      cameraOnline: true,
      lastSeenAt: new Date(Date.now() - 40_000),
    });
    const result = await service.getByResident('org-1', 'r1');
    expect(result?.cameraOnline).toBe(false);
  });

  it('keeps cameraOnline true within the 30s window', async () => {
    const { service, residentStatus } = setup();
    residentStatus.findUnique.mockResolvedValue({
      residentId: 'r1',
      cameraOnline: true,
      lastSeenAt: new Date(Date.now() - 5_000),
    });
    const result = await service.getByResident('org-1', 'r1');
    expect(result?.cameraOnline).toBe(true);
  });

  it('returns null when the resident has no status row', async () => {
    const { service, residentStatus } = setup();
    residentStatus.findUnique.mockResolvedValue(null);
    await expect(service.getByResident('org-1', 'r1')).resolves.toBeNull();
  });

  it('skips the heartbeat upsert when no resident is assigned', async () => {
    const { service, residentStatus } = setup();
    await service.recordCameraHeartbeat('org-1', 'cam-1', null);
    expect(residentStatus.upsert).not.toHaveBeenCalled();
  });
});
