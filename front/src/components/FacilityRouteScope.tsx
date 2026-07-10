import { type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  ACCESS_DENIED_PATH,
  FACILITIES_PICKER_PATH,
  adminPath,
  alertsPath,
  dashboardPath,
  floorPath,
} from "@/lib/routeAccess";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";

export function FacilityScope({ children }: { children: ReactNode }) {
  const { facilityId } = useParams<{ facilityId: string }>();
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const setFacility = useFacilityStore((s) => s.setFacility);

  if (!user) return <Navigate to="/login" replace />;
  if (!facilityId) return <Navigate to={ACCESS_DENIED_PATH} replace />;

  if (user.role !== "SUPER_ADMIN" && user.facilityId !== facilityId) {
    return <Navigate to={ACCESS_DENIED_PATH} replace />;
  }

  if (currentFacilityId !== facilityId) {
    setFacility(facilityId);
    return null;
  }

  return <>{children}</>;
}

export function LegacyDashboardRedirect() {
  const targetFacilityId = useLegacyFacilityId();
  if (!targetFacilityId) return <Navigate to={FACILITIES_PICKER_PATH} replace />;
  return <Navigate to={dashboardPath(targetFacilityId)} replace />;
}

export function LegacyFloorRedirect() {
  const { floorId } = useParams<{ floorId: string }>();
  const targetFacilityId = useLegacyFacilityId();
  if (!targetFacilityId || !floorId) return <Navigate to={targetFacilityId ? ACCESS_DENIED_PATH : FACILITIES_PICKER_PATH} replace />;
  return <Navigate to={floorPath(targetFacilityId, floorId)} replace />;
}

export function LegacyAlertsRedirect() {
  const targetFacilityId = useLegacyFacilityId();
  if (!targetFacilityId) return <Navigate to={FACILITIES_PICKER_PATH} replace />;
  return <Navigate to={alertsPath(targetFacilityId)} replace />;
}

export function LegacyAdminRedirect() {
  const { "*": rest = "" } = useParams<{ "*"?: string }>();
  const targetFacilityId = useLegacyFacilityId();
  if (!targetFacilityId) return <Navigate to={FACILITIES_PICKER_PATH} replace />;
  return <Navigate to={adminPath(targetFacilityId, rest)} replace />;
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

  const target = legacyFacilityTarget(facilityId, view, rest);
  if (!target) return <Navigate to={ACCESS_DENIED_PATH} replace />;
  setFacility(facilityId);
  return <Navigate to={target} replace />;
}

function useLegacyFacilityId(): string | null {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  if (!user) return null;
  if (user.role === "SUPER_ADMIN") return currentFacilityId;
  return user.facilityId;
}

function legacyFacilityTarget(facilityId: string, view: string | undefined, rest: string): string | null {
  const clean = rest.replace(/^\/+/, "");
  if (clean.includes("ux-test")) return null;

  if (view === "staff") {
    if (!clean) return dashboardPath(facilityId);
    if (clean === "alerts") return alertsPath(facilityId);
    const floor = clean.match(/^floors\/([^/]+)$/);
    if (floor) return floorPath(facilityId, decodeURIComponent(floor[1]));
    return null;
  }

  if (view === "admin") {
    if (!clean) return adminPath(facilityId);
    return adminPath(facilityId, clean);
  }

  return null;
}

export { FacilityScope as FacilityRouteScope };
