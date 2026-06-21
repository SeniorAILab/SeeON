import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GuardiansService } from './guardians.service';

type GuardianDelegate = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

function setup() {
  const guardian: GuardianDelegate = {
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
        cb: (tx: { guardian: GuardianDelegate }) => unknown,
      ) => cb({ guardian }),
    ),
  } as unknown as PrismaService;
  return { service: new GuardiansService(prisma), guardian };
}

describe('GuardiansService', () => {
  it('filters by residentId when provided', async () => {
    const { service, guardian } = setup();
    guardian.findMany.mockResolvedValue([]);
    await service.list('facility-1', 'res-1');
    expect(guardian.findMany).toHaveBeenCalledWith({
      where: { residentId: 'res-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('requires residentId, name, and phone on create', async () => {
    const { service, guardian } = setup();
    await expect(
      service.create('facility-1', { residentId: '', name: 'A', phone: '010' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(guardian.create).not.toHaveBeenCalled();
  });

  it('normalizes blank relation to null on create', async () => {
    const { service, guardian } = setup();
    guardian.create.mockResolvedValue({ id: 'g1' });
    await service.create('facility-1', {
      residentId: 'res-1',
      name: '  Lee ',
      phone: ' 01012345678 ',
      relation: '   ',
    });
    expect(guardian.create).toHaveBeenCalledWith({
      data: {
        facilityId: 'facility-1',
        residentId: 'res-1',
        name: 'Lee',
        phone: '01012345678',
        relation: null,
      },
    });
  });

  it('throws NotFound when updating a missing guardian', async () => {
    const { service, guardian } = setup();
    guardian.findUnique.mockResolvedValue(null);
    await expect(
      service.update('facility-1', 'missing', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
