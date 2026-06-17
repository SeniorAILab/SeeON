import { cookies } from "next/headers";
import { BACKEND_ORIGIN as backendOrigin } from "./config";

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
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader.includes("app_session=")) return null;

  const response = await fetch(`${backendOrigin}/auth/session`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as FrontSession;
}
