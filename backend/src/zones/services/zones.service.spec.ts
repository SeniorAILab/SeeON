import { ZonesService } from './zones.service';

describe('ZonesService', () => {
  const zone = {
    id: 'zone-1',
    facilityId: 'facility-session',
    spaceId: 'space-1',
    name: 'Bed A',
    type: 'BED',
    orderIndex: 1,
    createdAt: new Date('2026-06-21T00:00:00.000Z'),
  };

  function serviceWith(tx: Record<string, unknown>) {
    const prisma = {
      withFacilityContext: jest.fn(
        (_facilityId: string, fn: (tx: unknown) => unknown) => fn(tx),
      ),
    };
    return new ZonesService(prisma as never);
  }

  it('creates zones under the session facility and ignores body facilityId', async () => {
    const tx = { zone: { create: jest.fn().mockResolvedValue(zone) } };
    const service = serviceWith(tx);
    await expect(
      service.create('facility-session', {
        facilityId: 'evil',
        spaceId: 'space-1',
        name: 'Bed A',
        type: 'BED',
        orderIndex: 1,
      }),
    ).resolves.toMatchObject({ facilityId: 'facility-session', type: 'BED' });
    expect(tx.zone.create).toHaveBeenCalledWith({
      data: {
        facilityId: 'facility-session',
        spaceId: 'space-1',
        name: 'Bed A',
        type: 'BED',
        orderIndex: 1,
      },
    });
  });
});
