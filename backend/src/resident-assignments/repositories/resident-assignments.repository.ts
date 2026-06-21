import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ResidentAssignmentFilters {
  residentId?: string;
  spaceId?: string;
  zoneId?: string;
  active?: boolean;
}

@Injectable()
export class ResidentAssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(facilityId: string, filters: ResidentAssignmentFilters = {}) {
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
