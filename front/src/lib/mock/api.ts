// In-memory mock API router for demo mode. Mirrors the backend REST shapes the
// existing pages consume, reading/writing the single scenario source. Mutating
// admin verbs (POST/PATCH/DELETE on residents/cameras/guardians) mutate that
// in-memory scenario so demo CRUD behaves like a real backend with no network.
import { sortAlertsBySeq } from "../sse-utils";
import { ackAlert, crud, getScenario } from "./scenario";
import type { SseAlert } from "./types";

export class MockApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MockApiError";
  }
}

function filterAlerts(alerts: SseAlert[], query: string): SseAlert[] {
  const params = new URLSearchParams(query);
  let out = sortAlertsBySeq(alerts);
  const residentId = params.get("residentId");
  const status = params.get("status");
  // ponytail: backend ignores ?type= — parsed but not applied to match real API behaviour
  const afterSeq = params.get("afterSeq");
  const beforeSeq = params.get("beforeSeq");
  const limit = params.get("limit");
  if (residentId) out = out.filter((a) => a.residentId === residentId);
  if (status) out = out.filter((a) => a.status === status);
  if (afterSeq) out = out.filter((a) => BigInt(a.alertSeq) > BigInt(afterSeq));
  if (beforeSeq) out = out.filter((a) => BigInt(a.alertSeq) < BigInt(beforeSeq));
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

export async function mockApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const [rawPath, query = ""] = path.split("?");
  const s = getScenario();

  // /api/status  (GET all)
  if (rawPath === "/api/status" && method === "GET") {
    return s.statuses as unknown as T;
  }

  // /api/status/:residentId  (GET single) — real backend returns one ResidentStatus
  const statusByResidentMatch = rawPath.match(/^\/api\/status\/([^/]+)$/);
  if (statusByResidentMatch && method === "GET") {
    const residentId = decodeURIComponent(statusByResidentMatch[1]);
    const found = s.statuses.find((st) => st.residentId === residentId) ?? null;
    if (!found) throw new MockApiError(404, "status not found");
    return found as unknown as T;
  }

  // /api/alerts/:id/ack  (PATCH)
  const ackMatch = rawPath.match(/^\/api\/alerts\/([^/]+)\/ack$/);
  if (ackMatch && method === "PATCH") {
    const acked = ackAlert(decodeURIComponent(ackMatch[1]));
    if (!acked) throw new MockApiError(404, "alert not found or already acked");
    return acked as unknown as T;
  }

  // /api/alerts/:id  (GET)
  const alertMatch = rawPath.match(/^\/api\/alerts\/([^/]+)$/);
  if (alertMatch && method === "GET") {
    const id = decodeURIComponent(alertMatch[1]);
    const found = s.alerts.find((a) => a.id === id);
    if (!found) throw new MockApiError(404, "alert not found");
    return found as unknown as T;
  }

  // /api/alerts  (GET, with filters)
  if (rawPath === "/api/alerts" && method === "GET") {
    return filterAlerts(s.alerts, query) as unknown as T;
  }

  // /api/residents/:id  (GET) — flat shape matching real backend (no embedded guardians/alerts)
  const residentMatch = rawPath.match(/^\/api\/residents\/([^/]+)$/);
  if (residentMatch && method === "GET") {
    const id = decodeURIComponent(residentMatch[1]);
    const resident = s.residents.find((r) => r.id === id);
    if (!resident) throw new MockApiError(404, "resident not found");
    return {
      id: resident.id,
      name: resident.name,
      room: resident.room,
    } as unknown as T;
  }

  // /api/residents  (GET) — fresh array each call so useCrud.reload() re-renders after CRUD
  if (rawPath === "/api/residents" && method === "GET") {
    return [...s.residents] as unknown as T;
  }

  // /api/cameras  (GET, optional ?residentId= filter)
  if (rawPath === "/api/cameras" && method === "GET") {
    const params = new URLSearchParams(query);
    const residentId = params.get("residentId");
    const cameras = residentId
      ? s.cameras.filter((c) => c.residentId === residentId)
      : [...s.cameras];
    return cameras as unknown as T;
  }

  // /api/guardians  (GET, optional ?residentId= filter)
  if (rawPath === "/api/guardians" && method === "GET") {
    const params = new URLSearchParams(query);
    const residentId = params.get("residentId");
    const guardians = residentId
      ? s.guardians.filter((g) => g.residentId === residentId)
      : [...s.guardians];
    return guardians as unknown as T;
  }

  // Mutating admin verbs on known CRUD resources mutate the in-memory scenario
  // so the demo behaves like a real product: a created/edited/deleted record
  // shows up on the next list reload. Scoped to known resources so a misspelled
  // route surfaces as a missing-route error instead of a silent fake success.
  const adminMutation = rawPath.match(
    /^\/api\/(residents|cameras|guardians)(?:\/([^/]+))?$/,
  );
  if (
    adminMutation &&
    (method === "POST" || method === "PATCH" || method === "DELETE")
  ) {
    const key = adminMutation[1] as "residents" | "cameras" | "guardians";
    const id = adminMutation[2] ? decodeURIComponent(adminMutation[2]) : null;
    const body = init.body ? JSON.parse(init.body as string) : {};
    const result = crud(key, method, id, body);
    if (result === null) throw new MockApiError(404, `${key} not found`);
    return result as unknown as T;
  }

  throw new MockApiError(404, `no mock route for ${method} ${rawPath}`);
}
