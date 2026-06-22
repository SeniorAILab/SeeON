import { bindDemoUsers, parseKakaoIds } from '../../scripts/bind-demo-users';

describe('bind demo users script helpers', () => {
  it('parses argv before DEMO_KAKAO_IDS and deduplicates trimmed values', () => {
    expect(
      parseKakaoIds([' a ', 'b', 'a'], { DEMO_KAKAO_IDS: 'ignored' }),
    ).toEqual(['a', 'b']);
    expect(parseKakaoIds([], { DEMO_KAKAO_IDS: 'a, b,,a' })).toEqual([
      'a',
      'b',
    ]);
  });

  it('binds platform users to demo facility as SUPER_ADMIN in one transaction', async () => {
    const userUpdate = Promise.resolve({});
    const identityUpdate = Promise.resolve({});
    const prisma = {
      facility: {
        findUnique: jest.fn().mockResolvedValue({ id: 'demo-facility-01' }),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'user-1', kakaoId: 'kakao-1' }]),
        update: jest.fn().mockReturnValue(userUpdate),
      },
      kakaoIdentity: {
        updateMany: jest.fn().mockReturnValue(identityUpdate),
      },
      $transaction: jest.fn().mockResolvedValue([{}, {}]),
    };

    await expect(bindDemoUsers(prisma, ['kakao-1'])).resolves.toEqual({
      boundCount: 1,
    });

    expect(prisma.facility.findUnique).toHaveBeenCalledWith({
      where: { id: 'demo-facility-01' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { kakaoId: 'kakao-1' },
      data: { facilityId: 'demo-facility-01', role: 'SUPER_ADMIN' },
    });
    expect(prisma.kakaoIdentity.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { facilityId: 'demo-facility-01' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      userUpdate,
      identityUpdate,
    ]);
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
        ['kakao-1'],
      ),
    ).rejects.toThrow('Demo facility demo-facility-01 does not exist');

    await expect(
      bindDemoUsers(
        {
          facility: {
            findUnique: jest.fn().mockResolvedValue({ id: 'demo-facility-01' }),
          },
          user: {
            findMany: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
          },
          kakaoIdentity: { updateMany: jest.fn() },
          $transaction: jest.fn(),
        },
        ['missing'],
      ),
    ).rejects.toThrow('Kakao user(s) not found');
  });
});
