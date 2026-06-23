import type { Level } from '@prisma/client';

export interface CreateResidentRequestDto {
  name: string;
  spaceId?: string;
  zoneId?: string | null;
  gender?: string | null;
  age?: number | null;
  diagnosisTags?: string[];
  fallRiskBaseline?: Level | null;
  isFocusResident?: boolean;
}

export interface UpdateResidentRequestDto {
  name?: string;
  gender?: string | null;
  age?: number | null;
  diagnosisTags?: string[];
  fallRiskBaseline?: Level | null;
  isFocusResident?: boolean;
  isActive?: boolean;
}

export interface ResidentListQueryDto {
  isFocusResident?: string;
  spaceId?: string;
  active?: string;
}

export interface MoveResidentAssignmentRequestDto {
  spaceId?: string;
  zoneId?: string | null;
}
