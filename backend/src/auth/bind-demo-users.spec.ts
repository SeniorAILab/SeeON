import {
  bindDemoUsers,
  parseBindArgs,
  parseKakaoIds,
} from '../../scripts/bind-demo-users';

describe('bind demo users script helpers', () => {
  it('parses exact Kakao ids, emails, and dry-run without broad matching', () => {
    expect(
      parseBindArgs(
        ['--dry-run', '--email', ' rhqjatn310@kakao ', ' kakao-1 ', 'kakao-1'],
        {
          SEED_BIND_KAKAO_ID: 'ignored',
          SEED_BIND_KAKAO_EMAIL: 'ignored@example.com',
        },
      ),
    ).toEqual({
      dryRun: true,
      emails: ['rhqjatn310@kakao'],
      kakaoIds: ['kakao-1'],
    });

    expect(
      parseBindArgs([], {
        SEED_BIND_KAKAO_ID: 'kakao-2,kakao-2',
        SEED_BIND_KAKAO_EMAIL: 'rhqjatn310@kakao',
      }),
    ).toEqual({
      dryRun: false,
      emails: ['rhqjatn310@kakao'],
      kakaoIds: ['kakao-2'],
    });

    expect(parseKakaoIds([], { SEED_BIND_KAKAO_IDS: 'a, b,,a' })).toEqual([
      'a',
      'b',
    ]);
  });

  const demoFacilityId = 'clw0nokyangdemo000000000a';

  it('binds only exact Kakao-backed users to 녹양역점 as SUPER_ADMIN', async () => {
    const userUpdate = Promise.resolve({});
    const identityUpdate = Promise.resolve({});
    const prisma = {
      facility: {
        findUnique: jest.fn().mockResolvedValue({ id: demoFacilityId }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            email: 'rhqjatn310@kakao',
            facilityId: null,
            id: 'user-1',
            kakaoId: 'kakao-1',
            role: 'ADMIN',
          },
        ]),
        update: jest.fn().mockReturnValue(userUpdate),
      },
      kakaoIdentity: {
        updateMany: jest.fn().mockReturnValue(identityUpdate),
      },
      $transaction: jest.fn().mockResolvedValue([{}, {}]),
    };

    await expect(
      bindDemoUsers(prisma, {
        dryRun: false,
        emails: ['rhqjatn310@kakao'],
        kakaoIds: ['kakao-1'],
      }),
    ).resolves.toEqual({
      boundCount: 1,
      changes: [
        {
          email: 'rhqjatn310@kakao',
          id: 'user-1',
          kakaoId: 'kakao-1',
          nextFacilityId: demoFacilityId,
          nextRole: 'SUPER_ADMIN',
          previousFacilityId: null,
          previousRole: 'ADMIN',
        },
      ],
      dryRun: false,
    });

    expect(prisma.facility.findUnique).toHaveBeenCalledWith({
      where: { code: 'happy-nokyang' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        facilityId: demoFacilityId,
        role: 'SUPER_ADMIN',
        sessionVersion: { increment: 1 },
      },
    });
    expect(prisma.kakaoIdentity.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { facilityId: demoFacilityId },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      userUpdate,
      identityUpdate,
    ]);
  });

  it('dry-runs exact binding without mutating users', async () => {
    const prisma = {
      facility: {
        findUnique: jest.fn().mockResolvedValue({ id: demoFacilityId }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            email: 'rhqjatn310@kakao',
            facilityId: null,
            id: 'user-1',
            kakaoId: 'kakao-1',
            role: 'ADMIN',
          },
        ]),
        update: jest.fn(),
      },
      kakaoIdentity: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };

    await expect(
      bindDemoUsers(prisma, {
        dryRun: true,
        emails: ['rhqjatn310@kakao'],
        kakaoIds: [],
      }),
    ).resolves.toMatchObject({ boundCount: 1, dryRun: true });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.kakaoIdentity.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails honestly when facility or users are missing', async () => {
    await expect(
      bindDemoUsers(
        {
          facility: { findUnique: jest.fn().mockResolvedValue(null) },
          user: { findMany: jest.fn(), update: jest.fn() },
          kakaoIdentity: { updateMany: jest.fn() },
          $transaction: jest.fn(),
        },
        { dryRun: false, emails: [], kakaoIds: ['kakao-1'] },
      ),
    ).rejects.toThrow('Demo facility with code happy-nokyang does not exist');

    await expect(
      bindDemoUsers(
        {
          facility: {
            findUnique: jest.fn().mockResolvedValue({ id: demoFacilityId }),
          },
          user: {
            findMany: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
          },
          kakaoIdentity: { updateMany: jest.fn() },
          $transaction: jest.fn(),
        },
        { dryRun: false, emails: [], kakaoIds: ['missing'] },
      ),
    ).rejects.toThrow('Kakao user(s) not found');
  });
});
