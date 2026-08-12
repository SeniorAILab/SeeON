import { spawn } from 'node:child_process';
import {
  closeSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { hashPassword, verifyPassword } from '../src/auth/password';
import {
  readPasswordFromFileDescriptor,
  resetAdminPassword,
  runResetAdminPasswordCli,
} from '../prisma/reset-admin-password';

const ADMIN_EMAIL = 'admin-reset@example.test';
const STAFF_EMAIL = 'staff-reset@example.test';
const SUPER_ADMIN_EMAIL = 'super-admin-reset@example.test';
const UNRELATED_EMAIL = 'unrelated-reset@example.test';
const OLD_PASSWORD = 'old-password-value';
const NEW_PASSWORD = 'new-password-value';

type TestUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  role: 'ADMIN' | 'STAFF' | 'SUPER_ADMIN';
  facilityId: string | null;
  nickname: string;
  phone: string | null;
  sessionVersion: number;
};

class InMemoryAdminResetPrisma {
  readonly transactionOptions: unknown[] = [];
  readonly updates: unknown[] = [];
  private users: TestUser[];

  constructor(users: readonly TestUser[]) {
    this.users = structuredClone([...users]);
  }

  async $transaction<T>(
    callback: (transaction: unknown) => Promise<T>,
    options?: unknown,
  ): Promise<T> {
    this.transactionOptions.push(options);
    const pending = structuredClone(this.users);
    const transaction = {
      user: {
        findUnique: ({ where }: { where: { email: string } }) =>
          Promise.resolve(
            pending.find((candidate) => candidate.email === where.email) ??
              null,
          ),
        update: (args: {
          where: { id: string };
          data: {
            passwordHash: string;
            sessionVersion: { increment: number };
          };
          select: { id: true; email: true };
        }) => {
          this.updates.push(args);
          const user = pending.find(
            (candidate) => candidate.id === args.where.id,
          );
          if (!user) throw new Error('test user not found');
          user.passwordHash = args.data.passwordHash;
          user.sessionVersion += args.data.sessionVersion.increment;
          return Promise.resolve({ id: user.id, email: user.email });
        },
      },
    };
    const result = await callback(transaction);
    this.users = pending;
    return result;
  }

  snapshot(): TestUser[] {
    return structuredClone(this.users);
  }
}

function user(
  id: string,
  email: string,
  role: TestUser['role'],
  passwordHash: string | null,
  sessionVersion: number,
): TestUser {
  return {
    id,
    email,
    passwordHash,
    role,
    facilityId: role === 'SUPER_ADMIN' ? null : 'facility-reset',
    nickname: `${role} reset fixture`,
    phone: '010-0000-0000',
    sessionVersion,
  };
}

async function fixture(): Promise<{
  prisma: InMemoryAdminResetPrisma;
  initial: TestUser[];
}> {
  const initial = [
    user(
      'admin-reset',
      ADMIN_EMAIL,
      'ADMIN',
      await hashPassword(OLD_PASSWORD),
      7,
    ),
    user(
      'staff-reset',
      STAFF_EMAIL,
      'STAFF',
      await hashPassword(OLD_PASSWORD),
      2,
    ),
    user(
      'super-admin-reset',
      SUPER_ADMIN_EMAIL,
      'SUPER_ADMIN',
      await hashPassword(OLD_PASSWORD),
      4,
    ),
    user(
      'unrelated-reset',
      UNRELATED_EMAIL,
      'ADMIN',
      await hashPassword('unrelated-password'),
      9,
    ),
  ];
  return { prisma: new InMemoryAdminResetPrisma(initial), initial };
}

describe('guarded ADMIN password reset', () => {
  it('normalizes auth email, rotates only the hash, revokes sessions, and authenticates the new password', async () => {
    const { prisma, initial } = await fixture();

    await expect(
      resetAdminPassword(prisma as never, {
        email: '  ADMIN-RESET@EXAMPLE.TEST ',
        password: NEW_PASSWORD,
      }),
    ).resolves.toEqual({
      action: 'update',
      userId: 'admin-reset',
      email: ADMIN_EMAIL,
    });

    const after = prisma.snapshot();
    const beforeAdmin = initial[0];
    const afterAdmin = after[0];
    expect(typeof afterAdmin.passwordHash).toBe('string');
    expect(afterAdmin).toEqual({
      ...beforeAdmin,
      passwordHash: afterAdmin.passwordHash,
      sessionVersion: beforeAdmin.sessionVersion + 1,
    });
    expect(
      await verifyPassword(NEW_PASSWORD, afterAdmin.passwordHash ?? ''),
    ).toBe(true);
    expect(
      await verifyPassword(OLD_PASSWORD, afterAdmin.passwordHash ?? ''),
    ).toBe(false);
    expect(after.slice(1)).toEqual(initial.slice(1));
    expect(prisma.transactionOptions).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ]);
    expect(prisma.updates).toEqual([
      {
        where: { id: 'admin-reset' },
        data: {
          passwordHash: afterAdmin.passwordHash,
          sessionVersion: { increment: 1 },
        },
        select: { id: true, email: true },
      },
    ]);

    const authPrisma = {
      db: {
        user: {
          findFirst: jest.fn(({ where }: { where: { email: string } }) =>
            Promise.resolve(
              after.find((candidate) => candidate.email === where.email),
            ),
          ),
        },
      },
    };
    const jwt = { sign: jest.fn(() => 'reset-jwt') };
    const auth = new AuthService(
      authPrisma as never,
      jwt as never,
      new ConfigService({ JWT_TTL: '12h' }),
    );
    await expect(
      auth.loginWithPassword(ADMIN_EMAIL, NEW_PASSWORD),
    ).resolves.toMatchObject({
      token: 'reset-jwt',
      user: { id: 'admin-reset', sessionVersion: 8 },
    });
    await expect(
      auth.loginWithPassword(ADMIN_EMAIL, OLD_PASSWORD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns noop without changing the hash or sessionVersion for the same password', async () => {
    const { prisma, initial } = await fixture();

    await expect(
      resetAdminPassword(prisma as never, {
        email: ADMIN_EMAIL,
        password: OLD_PASSWORD,
      }),
    ).resolves.toEqual({
      action: 'noop',
      userId: 'admin-reset',
      email: ADMIN_EMAIL,
    });

    expect(prisma.snapshot()).toEqual(initial);
    expect(prisma.updates).toHaveLength(0);
  });

  it.each([
    ['a missing user', 'missing-reset@example.test'],
    ['a STAFF user', STAFF_EMAIL],
    ['a SUPER_ADMIN user', SUPER_ADMIN_EMAIL],
  ])('rejects %s with byte-identical rows', async (_case, email) => {
    const { prisma, initial } = await fixture();

    await expect(
      resetAdminPassword(prisma as never, { email, password: NEW_PASSWORD }),
    ).rejects.toThrow(/no rows changed/i);

    expect(prisma.snapshot()).toEqual(initial);
    expect(prisma.updates).toHaveLength(0);
  });

  it('rejects malformed email without starting a transaction', async () => {
    const { prisma, initial } = await fixture();

    await expect(
      resetAdminPassword(prisma as never, {
        email: 'not-an-email',
        password: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.snapshot()).toEqual(initial);
    expect(prisma.transactionOptions).toHaveLength(0);
  });

  it.each([
    ['7 code points', '가'.repeat(7)],
    ['129 code points', '나'.repeat(129)],
  ])('rejects %s without starting a transaction', async (_case, password) => {
    const { prisma, initial } = await fixture();

    await expect(
      resetAdminPassword(prisma as never, { email: ADMIN_EMAIL, password }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.snapshot()).toEqual(initial);
    expect(prisma.transactionOptions).toHaveLength(0);
  });

  it.each([
    ['8 code points', '가'.repeat(8)],
    ['128 three-byte code points', '나'.repeat(128)],
    ['128 four-byte code points', '😀'.repeat(128)],
  ])('accepts %s', async (_case, password) => {
    const { prisma } = await fixture();

    await expect(
      resetAdminPassword(prisma as never, { email: ADMIN_EMAIL, password }),
    ).resolves.toMatchObject({ action: 'update' });
    expect(
      await verifyPassword(password, prisma.snapshot()[0].passwordHash ?? ''),
    ).toBe(true);
  });

  it('prints redacted CLI success only after cleanup', async () => {
    const { prisma } = await fixture();
    const stdout: string[] = [];
    const stderr: string[] = [];
    let disconnected = false;

    await expect(
      runResetAdminPasswordCli(['--email', ADMIN_EMAIL], {
        env: { DIRECT_URL: 'postgresql://isolated.test/reset' },
        readPassword: () => NEW_PASSWORD,
        createPrismaClient: () =>
          ({
            $transaction: prisma.$transaction.bind(prisma),
            $disconnect: () => {
              disconnected = true;
              return Promise.resolve();
            },
          }) as never,
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      }),
    ).resolves.toBe(0);

    expect(disconnected).toBe(true);
    expect(stdout).toEqual(['ADMIN_PASSWORD_RESET_RESULT action=update']);
    expect(stderr).toEqual([]);
    expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain(
      NEW_PASSWORD,
    );
  });

  it('surfaces a same-password noop as a distinct machine-readable CLI action', async () => {
    const { prisma } = await fixture();
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(
      runResetAdminPasswordCli(['--email', ADMIN_EMAIL], {
        env: { DIRECT_URL: 'postgresql://isolated.test/reset' },
        readPassword: () => OLD_PASSWORD,
        createPrismaClient: () =>
          ({
            $transaction: prisma.$transaction.bind(prisma),
            $disconnect: () => Promise.resolve(),
          }) as never,
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      }),
    ).resolves.toBe(0);

    expect(stdout).toEqual(['ADMIN_PASSWORD_RESET_RESULT action=noop']);
    expect(stderr).toEqual([]);
    expect(prisma.updates).toHaveLength(0);
  });

  it('reads the canonical 128 four-byte code-point maximum from an FD', () => {
    const directory = mkdtempSync(join(tmpdir(), 'admin-reset-fd-'));
    const source = join(directory, 'password.source');
    const password = '😀'.repeat(128);
    writeFileSync(source, password);
    const fd = openSync(source, 'r');

    try {
      expect(readPasswordFromFileDescriptor(fd)).toBe(password);
    } finally {
      closeSync(fd);
      rmSync(directory, { recursive: true });
    }
  });

  it('stops reading an oversized FD stream without waiting for EOF', async () => {
    const child = spawn(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-e',
        [
          "const reset = require('./prisma/reset-admin-password');",
          'try {',
          '  reset.readPasswordFromFileDescriptor(0);',
          '  process.exitCode = 0;',
          '} catch (error) {',
          '  process.exitCode = error instanceof reset.AdminPasswordResetCliError && /too large/i.test(error.message) ? 23 : 24;',
          '}',
        ].join('\n'),
      ],
      { cwd: process.cwd(), stdio: ['pipe', 'ignore', 'pipe'] },
    );
    child.stdin.on('error', () => undefined);
    const exit = once(child, 'exit', { signal: AbortSignal.timeout(10_000) });

    child.stdin.write(Buffer.alloc(513, 0x61));

    await expect(exit).resolves.toEqual([23, null]);
    child.stdin.destroy();
  });

  it('redacts unexpected failures', async () => {
    const output: string[] = [];

    await expect(
      runResetAdminPasswordCli(['--email', ADMIN_EMAIL], {
        env: { DIRECT_URL: 'postgresql://isolated.test/reset' },
        readPassword: () => NEW_PASSWORD,
        createPrismaClient: () => {
          throw new Error(`unsafe detail ${NEW_PASSWORD}`);
        },
        stdout: (line) => output.push(line),
        stderr: (line) => output.push(line),
      }),
    ).resolves.toBe(1);

    expect(output).toEqual(['ADMIN password reset failed.']);
    expect(output.join('\n')).not.toContain(NEW_PASSWORD);
  });

  it('distinguishes disconnect failure after the reset transaction committed', async () => {
    const { prisma } = await fixture();
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(
      runResetAdminPasswordCli(['--email', ADMIN_EMAIL], {
        env: { DIRECT_URL: 'postgresql://isolated.test/reset' },
        readPassword: () => NEW_PASSWORD,
        createPrismaClient: () =>
          ({
            $transaction: prisma.$transaction.bind(prisma),
            $disconnect: () => Promise.reject(new Error('cleanup failed')),
          }) as never,
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      }),
    ).resolves.toBe(2);

    expect(stdout).toEqual(['ADMIN_PASSWORD_RESET_POST_COMMIT_DISCONNECT']);
    expect(stderr).toEqual([
      'ADMIN password reset transaction committed, but database disconnect failed.',
    ]);
  });
});
