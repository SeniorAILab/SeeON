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

export function getCurrentFacilityId(): string | null {
  return useFacilityStore.getState().currentFacilityId;
}

export function facilitiesForUser(userFacilityId: string | null): Facility[] {
  if (userFacilityId === null) return allFacilities;
  return allFacilities.filter((facility) => facility.id === userFacilityId);
}
