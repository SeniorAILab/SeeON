import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";

export function RouterBootstrap({ children }: { children: ReactNode }) {
  const init = useAuthStore((s) => s.init);
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (initialized && user && !currentFacilityId) {
      resolveForUser(user.facilityId);
    }
  }, [initialized, user, currentFacilityId, resolveForUser]);

  return <>{children}</>;
}
