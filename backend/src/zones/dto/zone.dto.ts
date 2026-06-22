export type ZoneType = 'BED' | 'AREA';
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
