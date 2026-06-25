import { PrismaClient } from '@prisma/client';

type CountRow = { count: number };

describe('resident_assignments RLS tenant isolation', () => {
  let direct: PrismaClient;
  let app: PrismaClient;

  beforeAll(async () => {
    if (!process.env.DIRECT_URL || !process.env.DATABASE_URL)
      throw new Error(
        'DIRECT_URL and DATABASE_URL are required for resident assignment RLS tests',
      );
    direct = new PrismaClient({
      datasources: { db: { url: process.env.DIRECT_URL } },
    });
    app = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await direct.$connect();
    await app.$connect();

    await direct.residentAssignment.deleteMany({
      where: { facilityId: { in: ['ra-a', 'ra-b'] } },
    });
    await direct.zone.deleteMany({
      where: { facilityId: { in: ['ra-a', 'ra-b'] } },
    });
    await direct.space.deleteMany({
      where: { facilityId: { in: ['ra-a', 'ra-b'] } },
    });
    await direct.floor.deleteMany({
      where: { facilityId: { in: ['ra-a', 'ra-b'] } },
    });
    await direct.resident.deleteMany({
      where: { facilityId: { in: ['ra-a', 'ra-b'] } },
    });
    await direct.facility.deleteMany({
      where: { id: { in: ['ra-a', 'ra-b'] } },
    });
    await direct.facility.createMany({
      data: [
        { id: 'ra-a', name: 'RA A', code: 'ra-a' },
        { id: 'ra-b', name: 'RA B', code: 'ra-b' },
      ],
    });
    await direct.floor.createMany({
      data: [
        {
          id: 'ra-floor-a',
          facilityId: 'ra-a',
          name: 'A Floor',
          orderIndex: 1,
        },
        {
          id: 'ra-floor-b',
          facilityId: 'ra-b',
          name: 'B Floor',
          orderIndex: 1,
        },
      ],
    });
    await direct.space.createMany({
      data: [
        {
          id: 'ra-space-a',
          facilityId: 'ra-a',
          floorId: 'ra-floor-a',
          name: 'A Room',
          type: 'ROOM',
          capacity: 1,
        },
        {
          id: 'ra-space-a2',
          facilityId: 'ra-a',
          floorId: 'ra-floor-a',
          name: 'A Room 2',
          type: 'ROOM',
          capacity: 1,
        },
        {
          id: 'ra-space-b',
          facilityId: 'ra-b',
          floorId: 'ra-floor-b',
          name: 'B Room',
          type: 'ROOM',
          capacity: 1,
        },
      ],
    });
    await direct.resident.createMany({
      data: [
        {
          id: 'ra-resident-a',
          facilityId: 'ra-a',
          name: 'A Resident',
        },
        {
          id: 'ra-resident-b',
          facilityId: 'ra-b',
          name: 'B Resident',
        },
      ],
    });
    await direct.residentAssignment.createMany({
      data: [
        {
          id: 'ra-assignment-a',
          facilityId: 'ra-a',
          residentId: 'ra-resident-a',
          spaceId: 'ra-space-a',
        },
        {
          id: 'ra-assignment-b',
          facilityId: 'ra-b',
          residentId: 'ra-resident-b',
          spaceId: 'ra-space-b',
        },
      ],
    });
  });

  afterAll(async () => {
    await app.$disconnect();
    await direct.$disconnect();
  });

  it('returns zero rows without app.facility_id', async () => {
    const rows = await app.$queryRaw<
      CountRow[]
    >`SELECT COUNT(*)::int AS count FROM resident_assignments`;
    expect(rows).toEqual([{ count: 0 }]);
  });

  it('cannot read another facility under wrong GUC', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.facility_id', 'ra-a', true)`;
      return tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM resident_assignments WHERE facility_id = 'ra-b'`;
    });
    expect(rows).toEqual([]);
  });

  it('denies a second active assignment for the same resident via partial unique index', async () => {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.facility_id', 'ra-a', true)`;
        await tx.$executeRaw`INSERT INTO resident_assignments (id, facility_id, resident_id, space_id) VALUES ('ra-assignment-a2', 'ra-a', 'ra-resident-a', 'ra-space-a2')`;
      }),
    ).rejects.toThrow();
  });
});
