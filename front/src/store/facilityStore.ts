import { create } from "zustand";
import type { FacilitySelectorItem } from "@/services/api/dashboardEndpoints";

interface FacilityState {
  currentFacilityId: string | null;
  facilities: FacilitySelectorItem[];
  setFacility: (id: string) => void;
  setFacilities: (facilities: readonly FacilitySelectorItem[]) => void;
  resolveForUser: (userFacilityId: string | null) => string | null;
}

export const useFacilityStore = create<FacilityState>((set) => ({
  currentFacilityId: null,
  facilities: [],
  setFacility: (id) => set({ currentFacilityId: id }),
  setFacilities: (facilities) => set({ facilities: [...facilities] }),
  resolveForUser: (userFacilityId) => {
    const id = userFacilityId;
    set({ currentFacilityId: id });
    return id;
  },
}));

export function getCurrentFacilityId(): string | null {
  return useFacilityStore.getState().currentFacilityId;
}

export function facilitiesForUser(
  userFacilityId: string | null,
  facilities: readonly FacilitySelectorItem[],
): FacilitySelectorItem[] {
  if (userFacilityId === null) return [...facilities];
  return facilities.filter((facility) => facility.id === userFacilityId);
}
