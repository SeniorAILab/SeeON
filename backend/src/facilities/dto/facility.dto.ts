export interface UpdateFacilityRequestDto {
  name?: string;
  address?: string | null;
  phone?: string | null;
}

export interface FacilitySelectionRequestDto {
  readonly selectionToken?: unknown;
}
