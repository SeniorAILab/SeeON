import { Injectable } from '@nestjs/common';
import type { Prisma, ZoneType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service.js';

export interface ZoneFilters {
  spaceId?: string;
  type?: ZoneType;
}

@Injectable()
export class ZonesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(facilityId: string, filters: ZoneFilters = {}) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.findMany({ where: filters, orderBy: { orderIndex: 'asc' } }),
    );
  }

  findById(facilityId: string, id: string) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.findUnique({ where: { id } }),
    );
  }

  create(facilityId: string, data: Prisma.ZoneUncheckedCreateInput) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.create({ data }),
    );
  }

  update(
    facilityId: string,
    id: string,
    data: Prisma.ZoneUncheckedUpdateInput,
  ) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.update({ where: { id }, data }),
    );
  }

  delete(facilityId: string, id: string) {
    return this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.delete({ where: { id } }),
    );
  }
}
