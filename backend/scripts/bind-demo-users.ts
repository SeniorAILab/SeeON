// Usage: pnpm demo:bind <kakaoId...> or DEMO_KAKAO_IDS=id1,id2 pnpm demo:bind.
import { PrismaClient } from '@prisma/client';

const DEMO_FACILITY_ID = 'demo-facility-01';

type BindPrisma = {
  facility: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>;
  };
  user: {
    findMany: (args: {
      where: { kakaoId: { in: string[] } };
      select: { id: true; kakaoId: true };
    }) => Promise<Array<{ id: string; kakaoId: string }>>;
    update: (args: {
      where: { kakaoId: string };
      data: { facilityId: string; role: 'SUPER_ADMIN' };
    }) => Promise<unknown>;
  };
  kakaoIdentity: {
    updateMany: (args: {
      where: { userId: string };
      data: { facilityId: string };
    }) => Promise<unknown>;
  };
  $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
};

class CliInputError extends Error {}

export function parseKakaoIds(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const values = argv.length > 0 ? argv : (env.DEMO_KAKAO_IDS ?? '').split(',');
  const ids = values.map((value) => value.trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

export async function bindDemoUsers(
  prisma: BindPrisma,
  kakaoIds: readonly string[],
  facilityId = DEMO_FACILITY_ID,
): Promise<{ boundCount: number }> {
  if (kakaoIds.length === 0) {
    throw new CliInputError(
      'Usage: pnpm demo:bind <kakaoId...> or DEMO_KAKAO_IDS=id1,id2 pnpm demo:bind',
    );
  }

  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
  });
  if (!facility) {
    throw new CliInputError(
      `Demo facility ${facilityId} does not exist. Run the demo seed first.`,
    );
  }

  const users = await prisma.user.findMany({
    where: { kakaoId: { in: [...kakaoIds] } },
    select: { id: true, kakaoId: true },
  });
  const found = new Set(users.map((user) => user.kakaoId));
  const missing = kakaoIds.filter((kakaoId) => !found.has(kakaoId));
  if (missing.length > 0) {
    throw new CliInputError(
      `${missing.length} Kakao user(s) not found. Log in once before binding demo users.`,
    );
  }

  await prisma.$transaction(
    users.flatMap((user) => [
      prisma.user.update({
        where: { kakaoId: user.kakaoId },
        data: { facilityId, role: 'SUPER_ADMIN' },
      }),
      prisma.kakaoIdentity.updateMany({
        where: { userId: user.id },
        data: { facilityId },
      }),
    ]),
  );

  return { boundCount: users.length };
}

function createPrismaClient(): PrismaClient {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new CliInputError(
      'DIRECT_URL must be set for privileged demo binding.',
    );
  }
  return new PrismaClient({ datasources: { db: { url: directUrl } } });
}

async function main(): Promise<void> {
  const kakaoIds = parseKakaoIds(process.argv.slice(2));
  const prisma = createPrismaClient();
  try {
    const result = await bindDemoUsers(prisma, kakaoIds);
    console.log(
      `Bound ${result.boundCount} demo user(s) to ${DEMO_FACILITY_ID}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof CliInputError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  });
}
