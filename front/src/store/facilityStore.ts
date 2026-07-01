import { create } from "zustand";
import { facilities as allFacilities } from "@/data/mockData";
import type { Facility } from "@/types";

interface FacilityState {
  currentFacilityId: string | null;
  setFacility: (id: string) => void;
  resolveForUser: (userFacilityId: string | null) => string | null;
}

export const useFacilityStore = create<FacilityState>((set) => ({
  currentFacilityId: null,
  setFacility: (id) => set({ currentFacilityId: id }),
  resolveForUser: (userFacilityId) => {
    const id = userFacilityId;
    set({ currentFacilityId: id });
    return id;
  },
}));

export function facilitiesForUser(userFacilityId: string | null): Facility[] {
  if (userFacilityId === null) return allFacilities; // SUPER_ADMIN: 전체
  return allFacilities.filter((f) => f.id === userFacilityId);
}
