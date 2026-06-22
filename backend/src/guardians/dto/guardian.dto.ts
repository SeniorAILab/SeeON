export interface CreateGuardianDto {
  residentId: string;
  name: string;
  phone: string;
  relation?: string;
}

export interface UpdateGuardianDto {
  name?: string;
  phone?: string;
  relation?: string | null;
}
