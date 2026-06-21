import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZoneType } from '@prisma/client';
import type { Zone } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateZoneDto, UpdateZoneDto } from '../dto/zone.dto.js';

interface ZoneFilters {
  spaceId?: string;
  type?: ZoneType;
}

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string, filters: ZoneFilters = {}) {
    const zones = await this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.findMany({ where: filters, orderBy: { orderIndex: 'asc' } }),
    );
    return zones.map(presentZone);
  }

  async create(facilityId: string, dto: CreateZoneDto) {
    const spaceId = dto.spaceId;
    const name = dto.name?.trim();
    const type = dto.type;
    if (!spaceId)
      throw new ConflictException({
        error: 'conflict',
        message: 'spaceId is required',
      });
    if (!name)
      throw new ConflictException({
        error: 'conflict',
        message: 'name is required',
      });
    if (!type || !Object.values(ZoneType).includes(type))
      throw new ConflictException({
        error: 'conflict',
        message: 'type is required',
      });
    const zone = await this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.create({
        data: {
          facilityId,
          spaceId,
          name,
          type,
          orderIndex: dto.orderIndex ?? 0,
        },
      }),
    );
    return presentZone(zone);
  }

  async update(facilityId: string, id: string, dto: UpdateZoneDto) {
    await this.ensureExists(facilityId, id);
    const data = normalizeZoneUpdate(dto);
    const zone = await this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.update({ where: { id }, data }),
    );
    return presentZone(zone);
  }

  async remove(facilityId: string, id: string) {
    await this.ensureExists(facilityId, id);
    await this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.delete({ where: { id } }),
    );
  }

  private async ensureExists(facilityId: string, id: string) {
    const zone = await this.prisma.withFacilityContext(facilityId, (tx) =>
      tx.zone.findUnique({ where: { id } }),
    );
    if (!zone)
      throw new NotFoundException({
        error: 'not_found',
        message: 'Zone not found',
      });
  }
}

function normalizeZoneUpdate(dto: UpdateZoneDto) {
  if (dto.name !== undefined && !dto.name.trim())
    throw new ConflictException({
      error: 'conflict',
      message: 'name is required',
    });
  if (dto.type !== undefined && !Object.values(ZoneType).includes(dto.type))
    throw new ConflictException({
      error: 'conflict',
      message: 'type is invalid',
    });
  return {
    spaceId: dto.spaceId,
    name: dto.name?.trim(),
    type: dto.type,
    orderIndex: dto.orderIndex,
  };
}

export function presentZone(zone: Zone) {
  return {
    id: zone.id,
    facilityId: zone.facilityId,
    spaceId: zone.spaceId,
    name: zone.name,
    type: zone.type,
    orderIndex: zone.orderIndex,
    createdAt: zone.createdAt.toISOString(),
  };
}
