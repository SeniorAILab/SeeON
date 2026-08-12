import { readFileSync } from 'node:fs';
import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../src/auth/password';
import {
  assertValidPassword,
  requiredPassword,
} from '../src/auth/password-policy';

type AdminTarget = {
  readonly id: string;
  readonly email: string | null;
  readonly passwordHash: string | null;
  readonly role: 'ADMIN' | 'STAFF' | 'SUPER_ADMIN';
};

type AdminResetTransaction = {
  readonly user: {
    findUnique(args: {
      where: { email: string };
      select: { id: true; email: true; passwordHash: true; role: true };
    }): Promise<AdminTarget | null>;
    update(args: {
      where: { id: string };
      data: {
        passwordHash: string;
        sessionVersion: { increment: 1 };
      };
      select: { id: true; email: true };
    }): Promise<{ id: string; email: string | null }>;
  };
};

export type AdminResetPrisma = {
  $transaction<T>(
    callback: (transaction: AdminResetTransaction) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
};

type AdminResetCliClient = AdminResetPrisma & {
  $disconnect(): Promise<void>;
};

export type AdminPasswordResetResult = {
  readonly action: 'update' | 'noop';
  readonly userId: string;
  readonly email: string;
};

export class AdminPasswordResetTargetError extends Error {
  readonly name = 'AdminPasswordResetTargetError';
}

export class AdminPasswordResetCliError extends Error {
  readonly name = 'AdminPasswordResetCliError';
}

export async function resetAdminPassword(
  prisma: AdminResetPrisma,
  input: { readonly email: unknown; readonly password: unknown },
): Promise<AdminPasswordResetResult> {
  const email = normalizeEmail(input.email);
  const password = requiredPassword(input.password);
  assertValidPassword(password);

  return prisma.$transaction(
    async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true, role: true },
      });
      if (!existing) {
        throw new AdminPasswordResetTargetError(
          'Target ADMIN user was not found; no rows changed.',
        );
      }
      if (existing.role !== 'ADMIN') {
        throw new AdminPasswordResetTargetError(
          'Target user does not have ADMIN role; no rows changed.',
        );
      }
      if (
        existing.passwordHash !== null &&
        (await verifyPassword(password, existing.passwordHash))
      ) {
        return {
          action: 'noop',
          userId: existing.id,
          email,
        };
      }

      const updated = await transaction.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await hashPassword(password),
          sessionVersion: { increment: 1 },
        },
        select: { id: true, email: true },
      });
      return {
        action: 'update',
        userId: updated.id,
        email: updated.email ?? email,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export type AdminResetCliDependencies = {
  readonly env: NodeJS.ProcessEnv;
  readonly readPassword: (fd: number) => unknown;
  readonly createPrismaClient: (env: NodeJS.ProcessEnv) => AdminResetCliClient;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
};

const USAGE =
  'Usage: reset-admin-password --email <ADMIN email> (password is read from ADMIN_PASSWORD_FD, default stdin)';

export async function runResetAdminPasswordCli(
  argv: readonly string[],
  dependencies: AdminResetCliDependencies = defaultCliDependencies(),
): Promise<number> {
  if (argv.length === 1 && argv[0] === '--help') {
    dependencies.stdout(USAGE);
    return 0;
  }

  let client: AdminResetCliClient | undefined;
  try {
    const email = parseEmailArgument(argv);
    const password = dependencies.readPassword(
      passwordFileDescriptor(dependencies.env),
    );
    client = dependencies.createPrismaClient(dependencies.env);
    const result = await resetAdminPassword(client, { email, password });
    await client.$disconnect();
    client = undefined;
    dependencies.stdout(
      `ADMIN password reset action=${result.action} userId=${result.userId} email=${result.email}`,
    );
    return 0;
  } catch (error: unknown) {
    if (client) {
      try {
        await client.$disconnect();
      } catch {
        // A reset failure is already authoritative; cleanup errors remain redacted.
      }
    }
    dependencies.stderr(redactedErrorMessage(error));
    return 1;
  }
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('email must be valid');
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new BadRequestException('email must be valid');
  }
  return normalized;
}

function parseEmailArgument(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== '--email' || argv[1].length === 0) {
    throw new AdminPasswordResetCliError(USAGE);
  }
  return argv[1];
}

function passwordFileDescriptor(env: NodeJS.ProcessEnv): number {
  const raw = env.ADMIN_PASSWORD_FD ?? '0';
  if (!/^\d+$/.test(raw)) {
    throw new AdminPasswordResetCliError(
      'ADMIN_PASSWORD_FD must identify a readable file descriptor.',
    );
  }
  const fd = Number(raw);
  if (!Number.isSafeInteger(fd)) {
    throw new AdminPasswordResetCliError(
      'ADMIN_PASSWORD_FD must identify a readable file descriptor.',
    );
  }
  return fd;
}

function createAdminResetPrismaClient(
  env: NodeJS.ProcessEnv,
): AdminResetCliClient {
  if (!env.DIRECT_URL) {
    throw new AdminPasswordResetCliError(
      'DIRECT_URL must be set for privileged ADMIN password reset access.',
    );
  }
  return new PrismaClient({
    datasources: { db: { url: env.DIRECT_URL } },
  });
}

function defaultCliDependencies(): AdminResetCliDependencies {
  return {
    env: process.env,
    readPassword: (fd) => readFileSync(fd, 'utf8'),
    createPrismaClient: createAdminResetPrismaClient,
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  };
}

function redactedErrorMessage(error: unknown): string {
  if (
    error instanceof AdminPasswordResetTargetError ||
    error instanceof AdminPasswordResetCliError ||
    error instanceof BadRequestException
  ) {
    return error.message;
  }
  return 'ADMIN password reset failed.';
}

if (require.main === module) {
  void runResetAdminPasswordCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
