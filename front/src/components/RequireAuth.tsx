import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { forbiddenPathForUser } from "@/lib/routeAccess";
import { hasRole } from "@/lib/roles";
import type { Role } from "@/types";

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
