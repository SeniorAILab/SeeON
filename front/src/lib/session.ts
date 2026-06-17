import { cookies } from "next/headers";

export type FrontSessionUser = {
  id: string;
  orgId: string | null;
  role?: string;
  nickname?: string;
};

export type FrontSession = {
  user: FrontSessionUser;
};

const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

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
