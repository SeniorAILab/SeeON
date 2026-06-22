import type { ZonesRepository } from '../repositories/zones.repository';
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

  function serviceWith(
    repository: Partial<Record<keyof ZonesRepository, jest.Mock>>,
  ) {
    return new ZonesService(repository as never);
  }

  it('creates zones under the session facility and ignores body facilityId', async () => {
    const repository = { create: jest.fn().mockResolvedValue(zone) };
    const service = serviceWith(repository);
    await expect(
      service.create('facility-session', {
        facilityId: 'evil',
        spaceId: 'space-1',
        name: 'Bed A',
        type: 'BED',
        orderIndex: 1,
      }),
    ).resolves.toMatchObject({ facilityId: 'facility-session', type: 'BED' });
    expect(repository.create).toHaveBeenCalledWith('facility-session', {
      facilityId: 'facility-session',
      spaceId: 'space-1',
      name: 'Bed A',
      type: 'BED',
      orderIndex: 1,
    });
  });
});
