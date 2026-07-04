import { create } from "zustand";
import type { Facility, User } from "@/types";

const STORAGE_KEY = "eldercare.currentFacilityId";

interface FacilityMonitorController {
  stop: () => void;
  start: (id: string) => void;
}

let monitorController: FacilityMonitorController | null = null;

export function registerFacilityMonitorController(controller: FacilityMonitorController): void {
  monitorController = controller;
}


function readPersistedFacilityId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

function persistFacilityId(id: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  if (id) sessionStorage.setItem(STORAGE_KEY, id);
  else sessionStorage.removeItem(STORAGE_KEY);
}

interface FacilityState {
  currentFacilityId: string | null;
  facilities: Facility[];
  setFacility: (id: string) => void;
  clearFacility: () => void;
  switchFacility: (id: string | null) => void;
  setFacilities: (facilities: readonly Facility[]) => void;
  resolveForUser: (userFacilityId: string | null) => string | null;
  hydrateForUser: (user: User | null) => string | null;
}

export const useFacilityStore = create<FacilityState>((set, get) => ({
  currentFacilityId: readPersistedFacilityId(),
  facilities: [],
  setFacility: (id) => {
    persistFacilityId(id);
    set({ currentFacilityId: id });
  },
  clearFacility: () => {
    persistFacilityId(null);
    set({ currentFacilityId: null });
  },
  switchFacility: (id) => {
    monitorController?.stop();
    if (id) get().setFacility(id);
    else get().clearFacility();
    if (id) monitorController?.start(id);
  },
  setFacilities: (facilities) => set({ facilities: [...facilities] }),
  resolveForUser: (userFacilityId) => {
    if (userFacilityId) {
      get().setFacility(userFacilityId);
      return userFacilityId;
    }
    get().clearFacility();
    return null;
  },
  hydrateForUser: (user) => {
    if (!user) {
      get().clearFacility();
      return null;
    }
    if (user.role !== "SUPER_ADMIN") return get().resolveForUser(user.facilityId);
    return get().currentFacilityId;
  },
}));

export function getCurrentFacilityId(): string | null {
  return useFacilityStore.getState().currentFacilityId;
}

export function facilitiesForUser(
  userFacilityId: string | null,
  facilities: readonly Facility[],
): Facility[] {
  if (userFacilityId === null) return [...facilities];
  return facilities.filter((facility) => facility.id === userFacilityId);
}
