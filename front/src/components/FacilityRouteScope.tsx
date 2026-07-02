import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ACCESS_DENIED_PATH } from "@/lib/routeAccess";
import { getCurrentFacility } from "@/services/api/dashboardEndpoints";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

export function FacilityRouteScope({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const userFacilityId = user?.facilityId ?? null;
  const userId = user?.id ?? null;
  const userRole = user?.role ?? null;
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const setFacility = useFacilityStore((s) => s.setFacility);
  const [serverScopeFailed, setServerScopeFailed] = useState(false);

  useEffect(() => {
    setServerScopeFailed(false);
    if (!user || currentFacilityId) return;
    if (userFacilityId) {
      resolveForUser(userFacilityId);
      return;
    }
    if (userRole !== "SUPER_ADMIN") {
      setServerScopeFailed(true);
      return;
    }

    let active = true;
    getCurrentFacility()
      .then((facility) => {
        if (active) setFacility(facility.id);
      })
      .catch(() => {
        if (active) setServerScopeFailed(true);
      });
    return () => {
      active = false;
    };
  }, [
    currentFacilityId,
    resolveForUser,
    setFacility,
    user,
    userFacilityId,
    userId,
    userRole,
  ]);

  if (!user) {
    return <Navigate to={ACCESS_DENIED_PATH} replace />;
  }

  if (!currentFacilityId && !userFacilityId && serverScopeFailed) {
    return <Navigate to={ACCESS_DENIED_PATH} replace />;
  }

  if (!currentFacilityId) return null;

  return <>{children}</>;
}
