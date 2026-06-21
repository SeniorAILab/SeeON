import { ZoneType } from '@prisma/client';
export interface CreateZoneDto {
  spaceId?: string;
  name?: string;
  type?: ZoneType;
  orderIndex?: number;
  facilityId?: string;
}
export interface UpdateZoneDto {
  spaceId?: string;
  name?: string;
  type?: ZoneType;
  orderIndex?: number;
  facilityId?: string;
}
