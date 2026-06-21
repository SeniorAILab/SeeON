import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ResidentsRepository } from './residents.repository';
import { ResidentsService } from './residents.service';

const now = new Date('2026-06-21T00:00:00.000Z');

function resident(overrides = {}) {
  return {
    id: 'r1',
    facilityId: 'facility-1',
    name: 'Kim',
    room: '201',
    gender: null,
    age: null,
    diagnosisTags: [],
    fallRiskBaseline: null,
    isFocusResident: false,
    isActive: true,
    createdAt: now,
    assignments: [
      {
        id: 'a1',
        facilityId: 'facility-1',
        residentId: 'r1',
        spaceId: 'space-1',
        zoneId: null,
        startedAt: now,
        endedAt: null,
        createdAt: now,
      },
    ],
    ...overrides,
  };
}

function setup() {
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    createWithPlacement: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    currentAssignment: jest.fn(),
    move: jest.fn(),
    listHistory: jest.fn(),
  } as unknown as jest.Mocked<ResidentsRepository>;
  return { service: new ResidentsService(repo), repo };
}

describe('ResidentsService', () => {
  it('lists residents via repository and presents roomId from active assignment', async () => {
    const { service, repo } = setup();
    repo.list.mockResolvedValue([resident()] as never);
    await expect(
      service.list('facility-1', { spaceId: 'space-1' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'r1', roomId: 'space-1', isActive: true }),
    ]);
    expect(repo.list).toHaveBeenCalledWith('facility-1', {
      spaceId: 'space-1',
    });
  });

  it('create requires spaceId before repository createWithPlacement', async () => {
    const { service, repo } = setup();
    await expect(
      service.create('facility-1', { name: 'Kim' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createWithPlacement).not.toHaveBeenCalled();
  });

  it('create=place delegates one repository call with trimmed resident data', async () => {
    const { service, repo } = setup();
    repo.createWithPlacement.mockResolvedValue(resident());
    await expect(
      service.create('facility-1', {
        name: '  Kim  ',
        room: '  201 ',
        spaceId: 'space-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'r1', roomId: 'space-1' }),
    );
    expect(repo.createWithPlacement).toHaveBeenCalledWith(
      'facility-1',
      expect.objectContaining({ name: 'Kim', room: '201' }),
      'space-1',
      null,
    );
  });

  it('rejects blank name on create', async () => {
    const { service } = setup();
    await expect(
      service.create('facility-1', { name: '   ', spaceId: 'space-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFound when getOne misses', async () => {
    const { service, repo } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(
      service.getOne('facility-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('soft-deletes resident and returns body', async () => {
    const { service, repo } = setup();
    repo.softDelete.mockResolvedValue(resident({ isActive: false }));
    await expect(service.remove('facility-1', 'r1')).resolves.toEqual(
      expect.objectContaining({ id: 'r1', isActive: false }),
    );
  });
});
