import type { ResidentAssignmentsRepository } from '../repositories/resident-assignments.repository';
import { ResidentAssignmentsService } from './resident-assignments.service';

const now = new Date('2026-06-21T00:00:00.000Z');

describe('ResidentAssignmentsService', () => {
  it('lists history through the read-only repository and presents camelCase', async () => {
    const repo = {
      list: jest.fn().mockResolvedValue([
        {
          id: 'a1',
          facilityId: 'f1',
          residentId: 'r1',
          spaceId: 's1',
          zoneId: null,
          startedAt: now,
          endedAt: null,
          createdAt: now,
        },
      ]),
    } as unknown as jest.Mocked<ResidentAssignmentsRepository>;
    const service = new ResidentAssignmentsService(repo);
    await expect(
      service.list('f1', { residentId: 'r1', active: true }),
    ).resolves.toEqual([
      {
        id: 'a1',
        facilityId: 'f1',
        residentId: 'r1',
        spaceId: 's1',
        zoneId: null,
        active: true,
        startedAt: now.toISOString(),
        endedAt: null,
      },
    ]);
    expect(repo.list.mock.calls[0]).toEqual([
      'f1',
      {
        residentId: 'r1',
        active: true,
      },
    ]);
  });
});
