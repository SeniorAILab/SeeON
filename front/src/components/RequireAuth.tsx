import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore, hasRole } from "@/store/authStore";
import { forbiddenPathForUser } from "@/lib/routeAccess";
import type { Role } from "@/types";

/** 인증 + (선택) 최소 권한 가드 */
export function RequireAuth({
  children,
  minRole,
}: {
  children: React.ReactNode;
  minRole?: Role;
}) {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const location = useLocation();

  if (!initialized) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (minRole && !hasRole(user, minRole)) {
    return <Navigate to={forbiddenPathForUser(user)} replace />;
  }
  return <>{children}</>;
}
