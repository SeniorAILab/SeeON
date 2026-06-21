import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ResidentsService } from './residents.service';

type ResidentDelegate = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

function setup() {
  const resident: ResidentDelegate = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    withFacilityContext: jest.fn(
      (
        _facilityId: string,
        cb: (tx: { resident: ResidentDelegate }) => unknown,
      ) => cb({ resident }),
    ),
  } as unknown as PrismaService;
  return { service: new ResidentsService(prisma), resident, prisma };
}

describe('ResidentsService', () => {
  it('lists residents scoped to the facility', async () => {
    const { service, resident, prisma } = setup();
    resident.findMany.mockResolvedValue([{ id: 'r1' }]);

    await expect(service.list('facility-1')).resolves.toEqual([{ id: 'r1' }]);
    expect(prisma.withFacilityContext).toHaveBeenCalledWith(
      'facility-1',
      expect.any(Function),
    );
    expect(resident.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
    });
  });

  it('rejects creation with a blank name', async () => {
    const { service, resident } = setup();
    await expect(
      service.create('facility-1', { name: '   ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(resident.create).not.toHaveBeenCalled();
  });

  it('trims name/room on create', async () => {
    const { service, resident } = setup();
    resident.create.mockResolvedValue({ id: 'r1' });

    await service.create('facility-1', { name: '  Kim  ', room: '  201  ' });
    expect(resident.create).toHaveBeenCalledWith({
      data: { facilityId: 'facility-1', name: 'Kim', room: '201' },
    });
  });

  it('throws NotFound when getOne misses', async () => {
    const { service, resident } = setup();
    resident.findUnique.mockResolvedValue(null);
    await expect(
      service.getOne('facility-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps FK constraint violations to ConflictException on remove', async () => {
    const { service, resident } = setup();
    resident.findUnique.mockResolvedValue({ id: 'r1' });
    resident.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );
    await expect(service.remove('facility-1', 'r1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
