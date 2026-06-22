import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Level, ResidentAssignment } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CreateResidentDto,
  UpdateResidentDto,
} from './dto/resident.dto.js';

import {
  ResidentsRepository,
  ResidentFilters,
} from './residents.repository.js';

type ResidentWithAssignments = {
  id: string;
  facilityId: string;
  name: string;
  gender: string | null;
  age: number | null;
  diagnosisTags: string[];
  fallRiskBaseline: Level | null;
  isFocusResident: boolean;
  isActive: boolean;
  createdAt: Date;
  assignments?: ResidentAssignment[];
};

@Injectable()
export class ResidentsService {
  constructor(private readonly residents: ResidentsRepository) {}

  async list(facilityId: string, filters: ResidentFilters = {}) {
    const rows = await this.residents.list(facilityId, filters);
    return rows.map((resident) => presentResident(resident));
  }

  async getOne(facilityId: string, id: string) {
    const resident = await this.residents.findById(facilityId, id);
    if (!resident) throw new NotFoundException('Resident not found');
    return presentResident(resident, true);
  }

  async create(facilityId: string, dto: CreateResidentDto) {
    const name = normalizeRequired(dto.name, 'name');
    const spaceId = dto.spaceId?.trim();
    if (!spaceId)
      throw new BadRequestException({
        error: 'conflict',
        message: 'spaceId is required',
      });
    try {
      const resident = await this.residents.createWithPlacement(
        facilityId,
        {
          name,
          gender:
            dto.gender !== undefined
              ? normalizeNullable(dto.gender)
              : undefined,
          age: dto.age ?? undefined,
          diagnosisTags: dto.diagnosisTags ?? undefined,
          fallRiskBaseline: dto.fallRiskBaseline ?? undefined,
          isFocusResident: dto.isFocusResident ?? undefined,
        },
        spaceId,
        normalizeNullable(dto.zoneId),
      );
      return presentResident(resident);
    } catch (err) {
      mapPlacementError(err);
    }
  }

  async update(facilityId: string, id: string, dto: UpdateResidentDto) {
    if (dto.name !== undefined && !dto.name.trim())
      throw new ConflictException('name is required');
    try {
      const resident = await this.residents.update(facilityId, id, {
        name: dto.name?.trim() ?? undefined,
        gender:
          dto.gender !== undefined ? normalizeNullable(dto.gender) : undefined,
        age: dto.age ?? undefined,
        diagnosisTags: dto.diagnosisTags ?? undefined,
        fallRiskBaseline: dto.fallRiskBaseline ?? undefined,
        isFocusResident: dto.isFocusResident ?? undefined,
        isActive: dto.isActive ?? undefined,
      });
      return presentResident(resident);
    } catch (err) {
      if (isNotFound(err)) throw new NotFoundException('Resident not found');
      throw err;
    }
  }

  async remove(facilityId: string, id: string) {
    try {
      return presentResident(await this.residents.softDelete(facilityId, id));
    } catch (err) {
      if (isNotFound(err)) throw new NotFoundException('Resident not found');
      throw err;
    }
  }

  async currentAssignment(facilityId: string, residentId: string) {
    const assignment = await this.residents.currentAssignment(
      facilityId,
      residentId,
    );
    if (!assignment)
      throw new NotFoundException('Current assignment not found');
    return presentAssignment(assignment);
  }

  async move(
    facilityId: string,
    residentId: string,
    body: { spaceId?: string; zoneId?: string | null },
  ) {
    const spaceId = body.spaceId?.trim();
    if (!spaceId)
      throw new BadRequestException({
        error: 'conflict',
        message: 'spaceId is required',
      });
    try {
      return presentAssignment(
        await this.residents.move(
          facilityId,
          residentId,
          spaceId,
          normalizeNullable(body.zoneId),
        ),
      );
    } catch (err) {
      mapPlacementError(err);
    }
  }
}

export function presentResident(
  resident: ResidentWithAssignments,
  detail = false,
) {
  const assignment = resident.assignments?.[0];
  return {
    id: resident.id,
    facilityId: resident.facilityId,
    roomId: assignment?.spaceId ?? null,
    name: resident.name,
    gender: resident.gender,
    age: resident.age,
    diagnosisTags: resident.diagnosisTags,
    fallRiskBaseline: resident.fallRiskBaseline,
    isFocusResident: resident.isFocusResident,
    isActive: resident.isActive,
    createdAt: resident.createdAt.toISOString(),
    ...(detail
      ? { currentAssignment: assignment ? presentAssignment(assignment) : null }
      : {}),
  };
}

export function presentAssignment(assignment: ResidentAssignment) {
  return {
    id: assignment.id,
    facilityId: assignment.facilityId,
    residentId: assignment.residentId,
    spaceId: assignment.spaceId,
    zoneId: assignment.zoneId,
    active: assignment.endedAt === null,
    startedAt: assignment.startedAt.toISOString(),
    endedAt: assignment.endedAt?.toISOString() ?? null,
  };
}

function normalizeRequired(value: string | undefined, field: string) {
  const normalized = value?.trim();
  if (!normalized) throw new ConflictException(`${field} is required`);
  return normalized;
}

function normalizeNullable(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

function mapPlacementError(err: unknown): never {
  if (err instanceof Error && err.message === 'RESIDENT_NOT_FOUND')
    throw new NotFoundException('Resident not found');
  if (err instanceof Error && err.message === 'SPACE_NOT_FOUND')
    throw new NotFoundException({
      error: 'not_found',
      message: 'spaceId not found',
    });
  if (err instanceof Error && err.message === 'ZONE_NOT_FOUND')
    throw new ConflictException({
      error: 'conflict',
      message: 'zoneId is invalid for spaceId',
    });
  throw err;
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
  );
}
