import { Navigate } from "react-router-dom";
import { defaultPathForUser } from "@/lib/routeAccess";
import { useAuthStore } from "@/store/authStore";

export function RoleRouteRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={defaultPathForUser(user)} replace />;
}
