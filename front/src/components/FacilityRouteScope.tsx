import { type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ACCESS_DENIED_PATH, DASHBOARD_HOME_PATH, adminPath, alertsPath, floorPath } from "@/lib/routeAccess";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

export function FacilityScope({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const setFacility = useFacilityStore((s) => s.setFacility);

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "SUPER_ADMIN") {
    if (!currentFacilityId) return <Navigate to={DASHBOARD_HOME_PATH} replace />;
    return <>{children}</>;
  }

  if (!user.facilityId) return <Navigate to={user.role === "ADMIN" ? "/onboarding" : ACCESS_DENIED_PATH} replace />;
  if (currentFacilityId !== user.facilityId) {
    setFacility(user.facilityId);
    return null;
  }
  return <>{children}</>;
}

export function LegacyFacilityRedirect() {
  const { facilityId, view, "*": rest = "" } = useParams<{
    facilityId: string;
    view?: string;
    "*"?: string;
  }>();
  const user = useAuthStore((s) => s.user);
  const setFacility = useFacilityStore((s) => s.setFacility);

  if (!user || !facilityId) return <Navigate to={ACCESS_DENIED_PATH} replace />;
  if (user.role !== "SUPER_ADMIN" && user.facilityId !== facilityId) {
    return <Navigate to={ACCESS_DENIED_PATH} replace />;
  }

  const target = legacyTarget(view, rest);
  if (!target) return <Navigate to={ACCESS_DENIED_PATH} replace />;
  setFacility(facilityId);
  return <Navigate to={target} replace />;
}

function legacyTarget(view: string | undefined, rest: string): string | null {
  const clean = rest.replace(/^\/+/, "");
  if (clean.includes("ux-test")) return null;

  if (view === "staff") {
    if (!clean) return DASHBOARD_HOME_PATH;
    if (clean === "alerts") return alertsPath();
    const floor = clean.match(/^floors\/([^/]+)$/);
    if (floor) return floorPath(decodeURIComponent(floor[1]));
    return null;
  }

  if (view === "admin") {
    if (!clean) return adminPath();
    return adminPath(clean);
  }

  return null;
}

export { FacilityScope as FacilityRouteScope };
