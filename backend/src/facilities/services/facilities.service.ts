import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, type Facility } from '@prisma/client';
import { SessionService } from '../../auth/session.service.js';
import type { UpdateFacilityRequestDto } from '../dto/facility.dto.js';
import {
  createFacilitySelectionToken,
  readFacilitySelectionToken,
} from '../facility-selection-token.js';
import { FacilitiesRepository } from '../repositories/facilities.repository.js';

export type FacilityListUser = {
  readonly role: Role;
  readonly facilityId: string | null;
};

export type FacilityListContext = {
  readonly sessionId?: string;
};

export type FacilitySelectionContext = {
  readonly sessionId: string;
  readonly rotatedFromSessionId?: string | null;
};

const SELECTION_TOKEN_TTL_SECONDS = 10 * 60;

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly facilitiesRepository: FacilitiesRepository,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  async current(facilityId: string) {
    const facility =
      await this.facilitiesRepository.getByFacilityId(facilityId);
    if (!facility)
      throw new NotFoundException({
        error: 'not_found',
        message: 'Facility not found',
      });
    return presentFacility(facility);
  }

  async listForUser(user: FacilityListUser, context: FacilityListContext = {}) {
    if (user.role === Role.SUPER_ADMIN) {
      const sessionId = context.sessionId;
      if (!sessionId) {
        throw new ForbiddenException('Session scope required');
      }
      return (await this.facilitiesRepository.listAll()).map((facility) => ({
        ...presentFacility(facility),
        selectionToken: createFacilitySelectionToken(
          {
            facilityId: facility.id,
            sessionId,
            expiresAtSeconds:
              Math.floor(Date.now() / 1000) + SELECTION_TOKEN_TTL_SECONDS,
          },
          this.selectionTokenSecret(),
        ),
      }));
    }
    if (!user.facilityId) {
      throw new ForbiddenException('Facility context required');
    }
    return (
      await this.facilitiesRepository.listByFacilityId(user.facilityId)
    ).map(presentFacility);
  }

  async selectForUser(
    user: FacilityListUser,
    context: FacilitySelectionContext,
    selectionToken: string,
  ) {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can select facilities');
    }
    const payload = readFacilitySelectionToken(
      selectionToken,
      this.selectionTokenSecret(),
    );
    const acceptedSessionIds = new Set(
      [context.sessionId, context.rotatedFromSessionId].filter(
        (sessionId): sessionId is string => typeof sessionId === 'string',
      ),
    );
    if (!payload || !acceptedSessionIds.has(payload.sessionId)) {
      throw new ForbiddenException('Invalid facility selection');
    }
    const facility = await this.facilitiesRepository.getByFacilityId(
      payload.facilityId,
    );
    if (!facility) {
      throw new NotFoundException({
        error: 'not_found',
        message: 'Facility not found',
      });
    }
    await this.sessions.setActiveFacility(context.sessionId, facility.id);
    return { facility: presentFacility(facility) };
  }

  async update(facilityId: string, dto: UpdateFacilityRequestDto) {
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new ConflictException({
        error: 'conflict',
        message: 'name is required',
      });
    }
    const facility = await this.facilitiesRepository.updateByFacilityId(
      facilityId,
      {
        name: dto.name?.trim() ?? undefined,
        address:
          dto.address !== undefined ? dto.address?.trim() || null : undefined,
        phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
      },
    );
    return presentFacility(facility);
  }

  private selectionTokenSecret(): string {
    const secret = this.config.get<string>('SESSION_JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'SESSION_JWT_SECRET must be at least 32 characters',
      );
    }
    return secret;
  }
}

function presentFacility(facility: Facility) {
  return {
    id: facility.id,
    name: facility.name,
    code: facility.code,
    address: facility.address ?? '',
    phone: facility.phone ?? '',
    createdAt: facility.createdAt.toISOString(),
  };
}
