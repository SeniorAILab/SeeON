import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  RequireFacilityGuard,
  SessionGuard,
  type RequestWithAuth,
} from './session.guard';

function contextFor(
  request: Partial<RequestWithAuth>,
  response: { cookie: jest.Mock } = { cookie: jest.fn() },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  it('emits a rotated session cookie for every protected route', async () => {
    const request = {
      headers: { cookie: 'app_session=old-token' },
    } as Partial<RequestWithAuth>;
    const response = { cookie: jest.fn() };
    const sessions = {
      validateToken: jest.fn().mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'admin@example.test',
          facilityId: 'session-facility',
          role: 'ADMIN',
          nickname: 'Admin',
          kakaoId: null,
          sessionVersion: 0,
        },
        session: {
          id: 'session-2',
          activeFacilityId: null,
        },
        rotatedToken: 'new-token',
        rotatedFromSessionId: 'session-1',
        maxAgeSeconds: 1800,
      }),
    };

    await expect(
      new SessionGuard(sessions as never).canActivate(
        contextFor(request, response),
      ),
    ).resolves.toBe(true);

    expect(response.cookie).toHaveBeenCalledWith(
      'app_session',
      'new-token',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 1_800_000,
        path: '/',
      }),
    );
    expect(request.sessionId).toBe('session-2');
    expect(request.rotatedFromSessionId).toBe('session-1');
  });
});

describe('RequireFacilityGuard', () => {
  it('uses the session facility for facility-bound users', () => {
    const request = {
      headers: { 'x-facility-id': 'other-facility' },
      query: { facilityId: 'query-facility' },
      user: {
        id: 'user-1',
        email: 'admin@example.test',
        facilityId: 'session-facility',
        role: 'ADMIN',
        nickname: 'Admin',
        kakaoId: null,
        sessionVersion: 0,
      },
    } as Partial<RequestWithAuth>;

    expect(new RequireFacilityGuard().canActivate(contextFor(request))).toBe(
      true,
    );
    expect(request.effectiveFacilityId).toBe('session-facility');
  });

  it('rejects facility-less super admins that only send a facility scope header', () => {
    const request = {
      headers: { 'x-facility-id': 'fac_happy_nokyang' },
      user: {
        id: 'user-1',
        email: 'seniorsailab@gmail.com',
        facilityId: null,
        role: 'SUPER_ADMIN',
        nickname: 'Senior AI Lab',
        kakaoId: null,
        sessionVersion: 0,
      },
    } as Partial<RequestWithAuth>;

    expect(() =>
      new RequireFacilityGuard().canActivate(contextFor(request)),
    ).toThrow(ForbiddenException);
    expect(request.effectiveFacilityId).toBeUndefined();
  });

  it('rejects facility-less super admins that only send an EventSource query scope', () => {
    const request = {
      headers: {},
      query: { facilityId: 'fac_happy_nokyang' },
      user: {
        id: 'user-1',
        email: 'seniorsailab@gmail.com',
        facilityId: null,
        role: 'SUPER_ADMIN',
        nickname: 'Senior AI Lab',
        kakaoId: null,
        sessionVersion: 0,
      },
    } as Partial<RequestWithAuth>;

    expect(() =>
      new RequireFacilityGuard().canActivate(contextFor(request)),
    ).toThrow(ForbiddenException);
    expect(request.effectiveFacilityId).toBeUndefined();
  });

  it('allows facility-less super admins with server-owned active session scope', () => {
    const request = {
      activeFacilityId: 'fac_happy_nokyang',
      headers: { 'x-facility-id': 'other-facility' },
      query: { facilityId: 'query-facility' },
      user: {
        id: 'user-1',
        email: 'seniorsailab@gmail.com',
        facilityId: null,
        role: 'SUPER_ADMIN',
        nickname: 'Senior AI Lab',
        kakaoId: null,
        sessionVersion: 0,
      },
    } as Partial<RequestWithAuth>;

    expect(new RequireFacilityGuard().canActivate(contextFor(request))).toBe(
      true,
    );
    expect(request.effectiveFacilityId).toBe('fac_happy_nokyang');
  });

  it('rejects facility-less non-super users even when they send a facility scope header', () => {
    const request = {
      headers: { 'x-facility-id': 'fac_happy_nokyang' },
      user: {
        id: 'user-1',
        email: 'staff@example.test',
        facilityId: null,
        role: 'STAFF',
        nickname: 'Staff',
        kakaoId: null,
        sessionVersion: 0,
      },
    } as Partial<RequestWithAuth>;

    expect(() =>
      new RequireFacilityGuard().canActivate(contextFor(request)),
    ).toThrow(ForbiddenException);
    expect(request.effectiveFacilityId).toBeUndefined();
  });
});
