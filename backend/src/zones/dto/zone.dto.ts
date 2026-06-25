export type ZoneType = 'BED' | 'AREA';
export interface CreateZoneRequestDto {
  spaceId?: string;
  name?: string;
  type?: ZoneType;
  orderIndex?: number;
  facilityId?: string;
}
export interface UpdateZoneRequestDto {
  spaceId?: string;
  name?: string;
  type?: ZoneType;
  orderIndex?: number;
  facilityId?: string;
}
