import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import { applyHtmlAppearance, useUiStore } from "@/stores/uiStore";

export function RouterBootstrap({ children }: { children: ReactNode }) {
  const init = useAuthStore((s) => s.init);
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    applyHtmlAppearance(theme);
  }, [theme]);

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
