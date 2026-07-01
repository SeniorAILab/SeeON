import { useEffect, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ACCESS_DENIED_PATH } from "@/lib/routeAccess";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

export function FacilityRouteScope({ children }: { children: ReactNode }) {
  const { facilityId } = useParams<{ facilityId: string }>();
  const user = useAuthStore((s) => s.user);
  const setFacility = useFacilityStore((s) => s.setFacility);

  const canEnterFacility =
    Boolean(facilityId && user) &&
    (user?.role === "SUPER_ADMIN" || user?.facilityId === facilityId);

  useEffect(() => {
    if (facilityId && canEnterFacility) setFacility(facilityId);
  }, [canEnterFacility, facilityId, setFacility]);

  if (!facilityId || !user || !canEnterFacility) {
    return <Navigate to={ACCESS_DENIED_PATH} replace />;
  }

  return <>{children}</>;
}
