import { cookies } from "next/headers";
import { BACKEND_ORIGIN as backendOrigin, isServerDemo } from "./config";
import { DEMO_SESSION } from "./mock/session";

export type FrontSessionUser = {
  id: string;
  orgId: string | null;
  role?: string;
  nickname?: string;
};

export type FrontSession = {
  user: FrontSessionUser;
};

export async function getFrontSession(): Promise<FrontSession | null> {
  // Demo mode: return a fixed session without reading cookies or calling the
  // backend, so server components render org-scoped content with zero network.
  if (isServerDemo()) {
    return DEMO_SESSION as FrontSession;
  }

  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader.includes("app_session=")) return null;

  const response = await fetch(`${backendOrigin}/auth/session`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as FrontSession;
}
