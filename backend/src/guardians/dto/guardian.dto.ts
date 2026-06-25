export interface CreateGuardianRequestDto {
  residentId: string;
  name: string;
  phone: string;
  relation?: string;
}

export interface UpdateGuardianRequestDto {
  name?: string;
  phone?: string;
  relation?: string | null;
}
