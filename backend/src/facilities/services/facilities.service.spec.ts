import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { SessionService } from '../../auth/session.service';
import { FacilitiesService } from './facilities.service';

describe('FacilitiesService', () => {
  const facility = {
    id: 'facility-session',
    name: 'Happy Home',
    code: 'happy-home',
    address: null,
    phone: null,
    businessRegistrationNumber: null,
    createdAt: new Date('2026-06-21T00:00:00.000Z'),
  };
  const otherFacility = {
    ...facility,
    id: 'other-facility',
    name: 'Other Home',
    code: 'other-home',
  };
  const sessions = {
    setActiveFacility: jest.fn().mockResolvedValue({}),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'SESSION_JWT_SECRET' ? 'x'.repeat(32) : undefined,
    ),
  } as unknown as ConfigService;

  function makeService(repository: object) {
    sessions.setActiveFacility.mockClear();
    return new FacilitiesService(
      repository as never,
      sessions as unknown as SessionService,
      config,
    );
  }

  function requireSelectionToken(selector: unknown) {
    if (
      typeof selector !== 'object' ||
      selector === null ||
      !('selectionToken' in selector) ||
      typeof selector.selectionToken !== 'string'
    ) {
      throw new Error('Expected facility selector token');
    }
    return selector.selectionToken;
  }

  it('reads the facility root directly by session facilityId', async () => {
    const repository = {
      getByFacilityId: jest.fn().mockResolvedValue(facility),
    };
    const service = makeService(repository);
    await expect(service.current('facility-session')).resolves.toMatchObject({
      code: 'happy-home',
    });
    expect(repository.getByFacilityId).toHaveBeenCalledWith('facility-session');
  });

  it('updates mutable facility profile fields only', async () => {
    const repository = {
      updateByFacilityId: jest
        .fn()
        .mockResolvedValue({ ...facility, name: 'New Name' }),
    };
    const service = makeService(repository);
    await service.update('facility-session', {
      name: 'New Name',
    });
    expect(repository.updateByFacilityId).toHaveBeenCalledWith(
      'facility-session',
      { name: 'New Name', address: undefined, phone: undefined },
    );
  });

  it('lists every facility for facility-less super admins', async () => {
    const repository = {
      listAll: jest.fn().mockResolvedValue([facility, otherFacility]),
    };
    const service = makeService(repository);

    const result = await service.listForUser(
      { role: Role.SUPER_ADMIN, facilityId: null },
      { sessionId: 'session-1' },
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'facility-session',
        selectionToken: expect.any(String) as string,
      }),
      expect.objectContaining({
        id: 'other-facility',
        selectionToken: expect.any(String) as string,
      }),
    ]);
    expect(requireSelectionToken(result[0])).not.toContain('facility-session');
    expect(repository.listAll).toHaveBeenCalledWith();
  });

  it('persists a super-admin selection from the backend-issued token only', async () => {
    const repository = {
      getByFacilityId: jest.fn().mockResolvedValue(facility),
      listAll: jest.fn().mockResolvedValue([facility]),
    };
    const service = makeService(repository);
    const [selector] = await service.listForUser(
      { role: Role.SUPER_ADMIN, facilityId: null },
      { sessionId: 'session-1' },
    );
    const selectionToken = requireSelectionToken(selector);

    await expect(
      service.selectForUser(
        { role: Role.SUPER_ADMIN, facilityId: null },
        { sessionId: 'session-1' },
        selectionToken,
      ),
    ).resolves.toMatchObject({ facility: { id: facility.id } });
    expect(repository.getByFacilityId).toHaveBeenCalledWith(facility.id);
    expect(sessions.setActiveFacility).toHaveBeenCalledWith(
      'session-1',
      facility.id,
    );
  });

  it('accepts a selector minted before request-time session rotation', async () => {
    const repository = {
      getByFacilityId: jest.fn().mockResolvedValue(facility),
      listAll: jest.fn().mockResolvedValue([facility]),
    };
    const service = makeService(repository);
    const [selector] = await service.listForUser(
      { role: Role.SUPER_ADMIN, facilityId: null },
      { sessionId: 'session-before-rotation' },
    );
    const selectionToken = requireSelectionToken(selector);

    await expect(
      service.selectForUser(
        { role: Role.SUPER_ADMIN, facilityId: null },
        {
          sessionId: 'session-after-rotation',
          rotatedFromSessionId: 'session-before-rotation',
        },
        selectionToken,
      ),
    ).resolves.toMatchObject({ facility: { id: facility.id } });
    expect(sessions.setActiveFacility).toHaveBeenCalledWith(
      'session-after-rotation',
      facility.id,
    );
  });

  it('rejects selections replayed from a different session', async () => {
    const repository = {
      listAll: jest.fn().mockResolvedValue([facility]),
    };
    const service = makeService(repository);
    const [selector] = await service.listForUser(
      { role: Role.SUPER_ADMIN, facilityId: null },
      { sessionId: 'session-1' },
    );
    const selectionToken = requireSelectionToken(selector);

    await expect(
      service.selectForUser(
        { role: Role.SUPER_ADMIN, facilityId: null },
        { sessionId: 'session-2' },
        selectionToken,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists only the caller facility for facility-bound users', async () => {
    const repository = {
      listByFacilityId: jest.fn().mockResolvedValue([facility]),
    };
    const service = makeService(repository);

    await expect(
      service.listForUser({ role: Role.ADMIN, facilityId: 'facility-session' }),
    ).resolves.toEqual([expect.objectContaining({ id: 'facility-session' })]);
    expect(repository.listByFacilityId).toHaveBeenCalledWith(
      'facility-session',
    );
  });

  it('rejects facility-less non-super users', async () => {
    const repository = {
      listAll: jest.fn(),
      listByFacilityId: jest.fn(),
    };
    const service = makeService(repository);

    await expect(
      service.listForUser({ role: Role.STAFF, facilityId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.listAll).not.toHaveBeenCalled();
    expect(repository.listByFacilityId).not.toHaveBeenCalled();
  });
});
