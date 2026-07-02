import { PrismaClient } from '@prisma/client';
import type {
  BindChange,
  BindOptions,
  BindPrisma,
  FoundUser,
  UserWhereClause,
} from './bind-demo-users.types';

const DEMO_FACILITY_ID = 'fac_happy_nokyang';

class CliInputError extends Error {}

function uniqueTrimmed(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function commaValues(value: string | undefined): string[] {
  return uniqueTrimmed((value ?? '').split(','));
}

export function parseKakaoIds(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const parsed = parseBindArgs(argv, env);
  if (parsed.kakaoIds.length > 0) {
    return [...parsed.kakaoIds];
  }
  return commaValues(env.DEMO_KAKAO_IDS);
}

export function parseBindArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): BindOptions {
  const emails: string[] = [];
  const kakaoIds: string[] = [];
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (value === '--email') {
      const email = argv[index + 1];
      if (!email) {
        throw new CliInputError('--email requires a value');
      }
      emails.push(email);
      index += 1;
      continue;
    }
    if (value === '--kakao-id') {
      const kakaoId = argv[index + 1];
      if (!kakaoId) {
        throw new CliInputError('--kakao-id requires a value');
      }
      kakaoIds.push(kakaoId);
      index += 1;
      continue;
    }
    kakaoIds.push(value);
  }

  return {
    dryRun,
    emails: uniqueTrimmed(
      emails.length > 0 ? emails : commaValues(env.DEMO_ADMIN_KAKAO_EMAIL),
    ),
    kakaoIds: uniqueTrimmed(
      kakaoIds.length > 0
        ? kakaoIds
        : [
            ...commaValues(env.DEMO_ADMIN_KAKAO_ID),
            ...commaValues(env.DEMO_KAKAO_IDS),
          ],
    ),
  };
}

function buildWhere(
  options: BindOptions,
): Parameters<BindPrisma['user']['findMany']>[0]['where'] {
  const clauses: UserWhereClause[] = [];
  if (options.kakaoIds.length > 0) {
    clauses.push({ kakaoId: { in: [...options.kakaoIds] } });
  }
  if (options.emails.length > 0) {
    clauses.push({
      email: { in: [...options.emails] },
      kakaoId: { not: null },
    });
  }
  return { OR: clauses };
}

function assertAllTargetsFound(
  options: BindOptions,
  users: readonly FoundUser[],
): asserts users is readonly (FoundUser & { readonly kakaoId: string })[] {
  const foundKakaoIds = new Set(
    users.flatMap((user) => (user.kakaoId ? [user.kakaoId] : [])),
  );
  const foundEmails = new Set(
    users.flatMap((user) => (user.email ? [user.email] : [])),
  );
  const missingKakaoIds = options.kakaoIds.filter(
    (kakaoId) => !foundKakaoIds.has(kakaoId),
  );
  const missingEmails = options.emails.filter(
    (email) => !foundEmails.has(email),
  );

  if (missingKakaoIds.length > 0 || missingEmails.length > 0) {
    throw new CliInputError(
      [
        'Kakao user(s) not found. Log in once before binding demo users.',
        missingKakaoIds.length > 0
          ? `missing kakaoId=${missingKakaoIds.join(',')}`
          : undefined,
        missingEmails.length > 0
          ? `missing email=${missingEmails.join(',')}`
          : undefined,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
}

function uniqueUsers(
  users: readonly (FoundUser & { readonly kakaoId: string })[],
) {
  const byId = new Map<string, FoundUser & { readonly kakaoId: string }>();
  for (const user of users) {
    byId.set(user.id, user);
  }
  return Array.from(byId.values());
}

export async function bindDemoUsers(
  prisma: BindPrisma,
  options: BindOptions,
  facilityId = DEMO_FACILITY_ID,
): Promise<{
  readonly boundCount: number;
  readonly changes: readonly BindChange[];
  readonly dryRun: boolean;
}> {
  if (options.kakaoIds.length === 0 && options.emails.length === 0) {
    throw new CliInputError(
      'Usage: pnpm backend:demo:bind -- --email <kakao-email> or DEMO_ADMIN_KAKAO_ID=<id> pnpm backend:demo:bind',
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
    where: buildWhere(options),
    select: {
      email: true,
      facilityId: true,
      id: true,
      kakaoId: true,
      role: true,
    },
  });
  assertAllTargetsFound(options, users);

  const targetUsers = uniqueUsers(users);
  const changes: readonly BindChange[] = targetUsers.map((user) => ({
    email: user.email,
    id: user.id,
    kakaoId: user.kakaoId,
    nextFacilityId: facilityId,
    nextRole: 'ADMIN',
    previousFacilityId: user.facilityId,
    previousRole: user.role,
  }));

  if (!options.dryRun) {
    await prisma.$transaction(
      targetUsers.flatMap((user) => [
        prisma.user.update({
          where: { id: user.id },
          data: {
            facilityId,
            role: 'ADMIN',
            sessionVersion: { increment: 1 },
          },
        }),
        prisma.kakaoIdentity.updateMany({
          where: { userId: user.id },
          data: { facilityId },
        }),
      ]),
    );
  }

  return { boundCount: targetUsers.length, changes, dryRun: options.dryRun };
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

function printAudit(result: Awaited<ReturnType<typeof bindDemoUsers>>): void {
  const mode = result.dryRun ? 'DRY-RUN would bind' : 'Bound';
  console.log(`${mode} ${result.boundCount} demo admin user(s).`);
  for (const change of result.changes) {
    console.log(
      [
        `user=${change.id}`,
        `email=${change.email ?? '<none>'}`,
        `kakaoId=${change.kakaoId}`,
        `role=${change.previousRole}->${change.nextRole}`,
        `facility=${change.previousFacilityId ?? '<none>'}->${change.nextFacilityId}`,
      ].join(' '),
    );
  }
}

async function main(): Promise<void> {
  const options = parseBindArgs(process.argv.slice(2));
  const prisma = createPrismaClient();
  try {
    const result = await bindDemoUsers(prisma, options);
    printAudit(result);
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
