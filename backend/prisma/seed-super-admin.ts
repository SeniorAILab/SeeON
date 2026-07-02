// Production super-admin bootstrap.
//
// This is a different layer from:
//   - prisma/seed.ts            → demo dataset (facility/residents/cameras), only on reset-demo.
//   - scripts/bind-demo-users.ts → ad-hoc operator promotion of EXISTING Kakao-backed users.
//
import { PrismaClient } from '@prisma/client';

import { hashPassword, verifyPassword } from '../src/auth/password';

const DEFAULT_EMAIL = 'seniorsailab@gmail.com';
const DEFAULT_NICKNAME = 'Senior AI Lab';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

export type SuperAdminConfig =
  | { readonly skip: true; readonly reason: string }
  | {
      readonly skip: false;
      readonly email: string;
      readonly password: string;
      readonly nickname: string;
    };

export function readSuperAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): SuperAdminConfig {
  const password = env.SUPER_ADMIN_PASSWORD ?? '';
  if (password.length === 0) {
    return { skip: true, reason: 'SUPER_ADMIN_PASSWORD is not set' };
  }
  const nickname = (env.SUPER_ADMIN_NICKNAME ?? '').trim() || DEFAULT_NICKNAME;
  return { skip: false, email: DEFAULT_EMAIL, password, nickname };
}

export type ExistingSuperAdmin = {
  readonly id: string;
  readonly role: Role;
  readonly passwordHash: string | null;
  readonly facilityId: string | null;
} | null;

export type SuperAdminAction = 'create' | 'update' | 'noop';

/// Pure decision: only skip (noop) when the account is already a SUPER_ADMIN whose
/// stored password already matches the requested one, so repeated deploys neither
/// rewrite the row nor churn sessionVersion (which would log the super admin out).
export function decideSuperAdminAction(
  existing: ExistingSuperAdmin,
  passwordMatches: boolean,
): SuperAdminAction {
  if (existing === null) {
    return 'create';
  }
  if (
    existing.role === 'SUPER_ADMIN' &&
    existing.passwordHash !== null &&
    passwordMatches &&
    existing.facilityId === null
  ) {
    return 'noop';
  }
  return 'update';
}

export type SuperAdminPrisma = {
  readonly user: {
    readonly findUnique: (args: {
      readonly where: { readonly email: string };
      readonly select: {
        readonly id: true;
        readonly role: true;
        readonly passwordHash: true;
        readonly facilityId: true;
      };
    }) => Promise<ExistingSuperAdmin>;
    readonly create: (args: {
      readonly data: {
        readonly email: string;
        readonly passwordHash: string;
        readonly nickname: string;
        readonly role: 'SUPER_ADMIN';
        readonly facilityId?: string | null;
      };
    }) => Promise<unknown>;
    readonly update: (args: {
      readonly where: { readonly id: string };
      readonly data: {
        readonly passwordHash: string;
        readonly nickname: string;
        readonly role: 'SUPER_ADMIN';
        readonly sessionVersion: { readonly increment: 1 };
        readonly facilityId?: string | null;
      };
    }) => Promise<unknown>;
  };
};

export async function bootstrapSuperAdmin(
  prisma: SuperAdminPrisma,
  config: Extract<SuperAdminConfig, { skip: false }>,
): Promise<SuperAdminAction> {
  const existing = await prisma.user.findUnique({
    where: { email: config.email },
    select: { id: true, role: true, passwordHash: true, facilityId: true },
  });
  const passwordMatches =
    existing?.passwordHash != null
      ? await verifyPassword(config.password, existing.passwordHash)
      : false;
  const action = decideSuperAdminAction(existing, passwordMatches);
  if (action === 'noop') {
    return 'noop';
  }

  const passwordHash = await hashPassword(config.password);
  if (existing === null) {
    await prisma.user.create({
      data: {
        email: config.email,
        passwordHash,
        nickname: config.nickname,
        role: 'SUPER_ADMIN',
        facilityId: null,
      },
    });
    return 'create';
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      passwordHash,
      nickname: config.nickname,
      role: 'SUPER_ADMIN',
      sessionVersion: { increment: 1 },
      facilityId: null,
    },
  });
  return 'update';
}

function createPrismaClient(): PrismaClient {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error(
      'DIRECT_URL must be set for privileged super-admin bootstrap.',
    );
  }
  return new PrismaClient({ datasources: { db: { url: directUrl } } });
}

async function main(): Promise<void> {
  const config = readSuperAdminConfig();
  if (config.skip) {
    console.log(`Skipping super-admin bootstrap: ${config.reason}.`);
    return;
  }
  const prisma = createPrismaClient();
  try {
    const action = await bootstrapSuperAdmin(prisma, config);
    console.log(
      `Super-admin bootstrap ${action}: email=${config.email} role=SUPER_ADMIN facility=<none>`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
