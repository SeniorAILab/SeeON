import { Injectable } from '@nestjs/common';
import type { Level, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

export interface ResidentFilters {
  isFocusResident?: boolean;
  spaceId?: string;
  active?: boolean;
}

export interface ResidentCreateData {
  name: string;
  gender?: string | null;
  age?: number | null;
  diagnosisTags?: string[];
  fallRiskBaseline?: Level | null;
  isFocusResident?: boolean;
}

export interface AssignmentFilters {
  residentId?: string;
  spaceId?: string;
  zoneId?: string;
  active?: boolean;
}

const residentInclude = {
  assignments: { where: { endedAt: null }, take: 1 },
} satisfies Prisma.ResidentInclude;

const residentDetailInclude = {
  residentStatus: true,
  guardians: true,
  assignments: { where: { endedAt: null }, take: 1 },
} satisfies Prisma.ResidentInclude;

@Injectable()
export class ResidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(facilityId: string, filters: ResidentFilters = {}) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.resident.findMany({
        where: {
          isFocusResident: filters.isFocusResident,
          isActive: filters.active,
          assignments: filters.spaceId
            ? { some: { endedAt: null, spaceId: filters.spaceId } }
            : undefined,
        },
        include: residentInclude,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  findById(facilityId: string, id: string) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.resident.findUnique({ where: { id }, include: residentDetailInclude }),
    );
  }

  createWithPlacement(
    facilityId: string,
    residentData: ResidentCreateData,
    spaceId: string,
    zoneId?: string | null,
  ) {
    return this.prisma.withFacilityContext(facilityId, async (tx) => {
      const space = await tx.space.findUnique({ where: { id: spaceId } });
      if (!space) throw new Error('SPACE_NOT_FOUND');
      if (zoneId) {
        const zone = await tx.zone.findUnique({ where: { id: zoneId } });
        if (!zone || zone.spaceId !== spaceId)
          throw new Error('ZONE_NOT_FOUND');
      }
      const resident = await tx.resident.create({
        data: { facilityId, ...residentData },
      });
      const assignment = await tx.residentAssignment.create({
        data: {
          facilityId,
          residentId: resident.id,
          spaceId,
          zoneId: zoneId ?? null,
        },
      });
      return { ...resident, assignments: [assignment] };
    });
  }

  update(
    facilityId: string,
    id: string,
    data: Prisma.ResidentUncheckedUpdateInput,
  ) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.resident.update({ where: { id }, data, include: residentInclude }),
    );
  }

  softDelete(facilityId: string, id: string) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.resident.update({
        where: { id },
        data: { isActive: false },
        include: residentInclude,
      }),
    );
  }

  currentAssignment(facilityId: string, residentId: string) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.residentAssignment.findFirst({
        where: { residentId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      }),
    );
  }

  move(
    facilityId: string,
    residentId: string,
    spaceId: string,
    zoneId?: string | null,
  ) {
    return this.prisma.withFacilityContext(facilityId, async (tx) => {
      const resident = await tx.resident.findUnique({
        where: { id: residentId },
      });
      if (!resident) throw new Error('RESIDENT_NOT_FOUND');
      const space = await tx.space.findUnique({ where: { id: spaceId } });
      if (!space) throw new Error('SPACE_NOT_FOUND');
      if (zoneId) {
        const zone = await tx.zone.findUnique({ where: { id: zoneId } });
        if (!zone || zone.spaceId !== spaceId)
          throw new Error('ZONE_NOT_FOUND');
      }
      const current = await tx.residentAssignment.findFirst({
        where: { residentId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });
      if (
        current?.spaceId === spaceId &&
        (current.zoneId ?? null) === (zoneId ?? null)
      )
        return current;
      const endedAt = new Date();
      if (current)
        await tx.residentAssignment.update({
          where: { id: current.id },
          data: { endedAt },
        });
      return tx.residentAssignment.create({
        data: { facilityId, residentId, spaceId, zoneId: zoneId ?? null },
      });
    });
  }

  listHistory(facilityId: string, filters: AssignmentFilters = {}) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.residentAssignment.findMany({
        where: {
          residentId: filters.residentId,
          spaceId: filters.spaceId,
          zoneId: filters.zoneId,
          endedAt:
            filters.active === undefined
              ? undefined
              : filters.active
                ? null
                : { not: null },
        },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  }
}
