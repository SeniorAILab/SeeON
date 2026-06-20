import { create } from "zustand";
import { facilities as allFacilities } from "@/data/mockData";
import type { Facility } from "@/types";

interface FacilityState {
  currentFacilityId: string | null;
  setFacility: (id: string) => void;
  resolveForUser: (userFacilityId: string | null) => string;
}

const DEFAULT_FACILITY = "fac_happy_nokyang";

export const useFacilityStore = create<FacilityState>((set) => ({
  currentFacilityId: null,
  setFacility: (id) => set({ currentFacilityId: id }),
  resolveForUser: (userFacilityId) => {
    // FACILITY_ADMIN/STAFF/VIEWER 는 자기 시설로 고정
    // SUPER_ADMIN(null)은 기본 시설 선택
    const id = userFacilityId ?? DEFAULT_FACILITY;
    set({ currentFacilityId: id });
    return id;
  },
}));

export function facilitiesForUser(userFacilityId: string | null): Facility[] {
  if (userFacilityId === null) return allFacilities; // SUPER_ADMIN: 전체
  return allFacilities.filter((f) => f.id === userFacilityId);
}
