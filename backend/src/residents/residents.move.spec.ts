import type { ResidentsRepository } from './residents.repository';
import { ResidentsService } from './residents.service';

const now = new Date('2026-06-21T00:00:00.000Z');
function setup() {
  const repo = {
    move: jest.fn(),
  } as unknown as jest.Mocked<ResidentsRepository>;
  return { service: new ResidentsService(repo), repo };
}

describe('ResidentsService move', () => {
  it('same-target move returns existing assignment idempotently', async () => {
    const { service, repo } = setup();
    repo.move.mockResolvedValue({
      id: 'a1',
      facilityId: 'f1',
      residentId: 'r1',
      spaceId: 's1',
      zoneId: null,
      startedAt: now,
      endedAt: null,
      createdAt: now,
    });
    await expect(service.move('f1', 'r1', { spaceId: 's1' })).resolves.toEqual(
      expect.objectContaining({ id: 'a1', active: true }),
    );
    expect(repo.move.mock.calls).toHaveLength(1);
  });

  it('different-target move presents the newly active assignment', async () => {
    const { service, repo } = setup();
    repo.move.mockResolvedValue({
      id: 'a2',
      facilityId: 'f1',
      residentId: 'r1',
      spaceId: 's2',
      zoneId: 'z2',
      startedAt: now,
      endedAt: null,
      createdAt: now,
    });
    await expect(
      service.move('f1', 'r1', { spaceId: 's2', zoneId: 'z2' }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'a2',
        spaceId: 's2',
        zoneId: 'z2',
        active: true,
      }),
    );
  });
});
