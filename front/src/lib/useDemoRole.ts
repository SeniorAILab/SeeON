"use client";

import { useSyncExternalStore } from "react";
import { getDemoRole, setDemoRole } from "./mock/session";
import type { DemoRole } from "./mock/types";

// External-store read for the frontend demo role. useSyncExternalStore reads the
// persisted role on the client and a stable "CAREGIVER" snapshot on the server,
// so there is no hydration mismatch and role changes re-render subscribers
// without a full page reload.
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = () => callback();
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useDemoRole(): DemoRole {
  return useSyncExternalStore(
    subscribe,
    getDemoRole,
    () => "CAREGIVER" as DemoRole,
  );
}

export function changeDemoRole(role: DemoRole): void {
  setDemoRole(role);
  for (const l of listeners) l();
}
