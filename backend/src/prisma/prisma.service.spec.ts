import { Prisma, PrismaClient } from '@prisma/client';
import { MissingTenantContextError } from '../common/errors';
import { PrismaService } from './prisma.service';

type RoleRow = {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

type CountRow = { count: number };
type IdRow = { id: string };

describe('Prisma tenant boundary (RLS + org GUC)', () => {
  let direct: PrismaClient;
  let prisma: PrismaService;

  beforeAll(async () => {
    if (!process.env.DIRECT_URL || !process.env.DATABASE_URL) {
      throw new Error(
        'DIRECT_URL and DATABASE_URL are required for tenant RLS tests',
      );
    }

    direct = new PrismaClient({
      datasources: { db: { url: process.env.DIRECT_URL } },
    });
    prisma = new PrismaService();
    await direct.$connect();
    await prisma.onModuleInit();

    await direct.alert.deleteMany();
    await direct.residentStatus.deleteMany();
    await direct.guardian.deleteMany();
    await direct.camera.deleteMany();
    await direct.kakaoIdentity.deleteMany();
    await direct.serverSession.deleteMany();
    await direct.user.deleteMany();
    await direct.resident.deleteMany();
    await direct.organization.deleteMany();

    await direct.organization.createMany({
      data: [
        { id: 'org-a', name: 'Org A' },
        { id: 'org-b', name: 'Org B' },
      ],
    });

    await direct.user.createMany({
      data: [
        {
          id: 'user-a',
          orgId: 'org-a',
          kakaoId: 'kakao-a',
          nickname: 'Owner A',
        },
        {
          id: 'user-b',
          orgId: 'org-b',
          kakaoId: 'kakao-b',
          nickname: 'Owner B',
        },
      ],
    });

    await direct.kakaoIdentity.createMany({
      data: [
        { id: 'kid-a', userId: 'user-a', orgId: 'org-a', kakaoId: 'kakao-a' },
        { id: 'kid-b', userId: 'user-b', orgId: 'org-b', kakaoId: 'kakao-b' },
      ],
    });

    await direct.resident.createMany({
      data: [
        { id: 'res-a', orgId: 'org-a', name: 'Resident A' },
        { id: 'res-b', orgId: 'org-b', name: 'Resident B' },
        { id: 'res-c', orgId: 'org-a', name: 'Resident C' },
      ],
    });

    await direct.guardian.createMany({
      data: [
        {
          id: 'guard-a',
          orgId: 'org-a',
          residentId: 'res-a',
          name: 'Guardian A',
          phone: '010-0000-0001',
        },
        {
          id: 'guard-b',
          orgId: 'org-b',
          residentId: 'res-b',
          name: 'Guardian B',
          phone: '010-0000-0002',
        },
      ],
    });

    await direct.camera.createMany({
      data: [
        {
          id: 'cam-a',
          orgId: 'org-a',
          residentId: 'res-a',
          label: 'Camera A',
          ingestKeyId: 'key-a',
          ingestSecretHash: 'hash-a',
        },
        {
          id: 'cam-b',
          orgId: 'org-b',
          residentId: 'res-b',
          label: 'Camera B',
          ingestKeyId: 'key-b',
          ingestSecretHash: 'hash-b',
        },
      ],
    });

    await direct.alert.createMany({
      data: [
        {
          id: 'alert-a',
          orgId: 'org-a',
          residentId: 'res-a',
          cameraId: 'cam-a',
          type: 'fall',
          probability: 0.91,
          detectedAt: new Date('2026-06-13T00:00:00.000Z'),
          idempotencyKey: 'idem-a',
        },
        {
          id: 'alert-b',
          orgId: 'org-b',
          residentId: 'res-b',
          cameraId: 'cam-b',
          type: 'fall',
          probability: 0.92,
          detectedAt: new Date('2026-06-13T00:01:00.000Z'),
          idempotencyKey: 'idem-b',
        },
      ],
    });

    await direct.residentStatus.createMany({
      data: [
        { id: 'status-a', orgId: 'org-a', residentId: 'res-a' },
        { id: 'status-b', orgId: 'org-b', residentId: 'res-b' },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    await direct?.$disconnect();
  });

  it('uses a dedicated runtime role without superuser or BYPASSRLS privileges', async () => {
    const rows = await direct.$queryRaw<RoleRow[]>`
      SELECT rolname, rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = 'fall_app'
    `;

    expect(rows).toEqual([
      { rolname: 'fall_app', rolsuper: false, rolbypassrls: false },
    ]);
  });

  it('fails closed for tenant model access without an application org context', async () => {
    await expect(prisma.db.resident.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    await expect(prisma.db.guardian.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    await expect(prisma.db.camera.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    await expect(prisma.db.alert.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    await expect(prisma.db.residentStatus.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    await expect(prisma.db.kakaoIdentity.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });

  it('lets Postgres RLS deny unscoped raw SQL issued by the app role', async () => {
    const rows = await prisma.db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::int AS count FROM "Resident"
    `;

    expect(rows[0]?.count).toBe(0);
  });

  it('binds app.current_org_id with SET LOCAL and scopes model plus raw queries to that org', async () => {
    const result = await prisma.withOrgContext('org-a', async (tx) => {
      const residents = await tx.resident.findMany({ orderBy: { id: 'asc' } });
      const rawResidents = await tx.$queryRaw<IdRow[]>`
        SELECT id FROM "Resident" ORDER BY id
      `;

      return {
        residentIds: residents.map((resident) => resident.id),
        rawResidentIds: rawResidents.map((resident) => resident.id),
        crossResident: await tx.resident.findUnique({ where: { id: 'res-b' } }),
        crossGuardian: await tx.guardian.findUnique({
          where: { id: 'guard-b' },
        }),
        crossCamera: await tx.camera.findUnique({ where: { id: 'cam-b' } }),
        crossAlert: await tx.alert.findUnique({ where: { id: 'alert-b' } }),
        crossStatus: await tx.residentStatus.findUnique({
          where: { id: 'status-b' },
        }),
        crossKakaoIdentity: await tx.kakaoIdentity.findUnique({
          where: { id: 'kid-b' },
        }),
      };
    });

    expect(result.residentIds).toEqual(['res-a', 'res-c']);
    expect(result.rawResidentIds).toEqual(['res-a', 'res-c']);
    expect(result.crossResident).toBeNull();
    expect(result.crossGuardian).toBeNull();
    expect(result.crossCamera).toBeNull();
    expect(result.crossAlert).toBeNull();
    expect(result.crossStatus).toBeNull();
    expect(result.crossKakaoIdentity).toBeNull();
  });

  it('rejects cross-org composite foreign keys at the database layer', async () => {
    await expectPrismaCode(
      direct.guardian.create({
        data: {
          id: 'bad-guardian',
          orgId: 'org-b',
          residentId: 'res-a',
          name: 'Bad Guardian',
          phone: '010-9999-0001',
        },
      }),
      'P2003',
    );

    await expectPrismaCode(
      direct.camera.create({
        data: {
          id: 'bad-camera',
          orgId: 'org-b',
          residentId: 'res-a',
          label: 'Bad Camera',
          ingestKeyId: 'bad-camera-key',
          ingestSecretHash: 'bad-camera-hash',
        },
      }),
      'P2003',
    );

    await expectPrismaCode(
      direct.alert.create({
        data: {
          id: 'bad-alert',
          orgId: 'org-b',
          residentId: 'res-b',
          cameraId: 'cam-a',
          type: 'fall',
          probability: 0.99,
          detectedAt: new Date('2026-06-13T00:02:00.000Z'),
          idempotencyKey: 'bad-alert',
        },
      }),
      'P2003',
    );

    await expectPrismaCode(
      direct.residentStatus.create({
        data: {
          id: 'bad-status',
          orgId: 'org-b',
          residentId: 'res-c',
        },
      }),
      'P2003',
    );
  });
});

async function expectPrismaCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected Prisma error ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe(code);
  }
}
