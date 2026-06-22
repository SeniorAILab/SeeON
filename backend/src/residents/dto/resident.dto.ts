import type { Level } from '@prisma/client';

export interface CreateResidentDto {
  name: string;
  spaceId?: string;
  zoneId?: string | null;
  gender?: string | null;
  age?: number | null;
  diagnosisTags?: string[];
  fallRiskBaseline?: Level | null;
  isFocusResident?: boolean;
}

export interface UpdateResidentDto {
  name?: string;
  gender?: string | null;
  age?: number | null;
  diagnosisTags?: string[];
  fallRiskBaseline?: Level | null;
  isFocusResident?: boolean;
  isActive?: boolean;
}
