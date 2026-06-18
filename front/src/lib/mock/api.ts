// In-memory mock API router for demo mode. Mirrors the backend REST shapes the
// existing pages consume, reading/writing the single scenario source. Mutating
// admin verbs (POST/PATCH/DELETE on residents/cameras/guardians) are accepted
// as no-ops so demo admin screens never hit a backend.
import { sortAlertsBySeq } from "../sse-utils";
import { ackAlert, getScenario } from "./scenario";
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
  const type = params.get("type");
  const afterSeq = params.get("afterSeq");
  const beforeSeq = params.get("beforeSeq");
  const limit = params.get("limit");
  if (residentId) out = out.filter((a) => a.residentId === residentId);
  if (status) out = out.filter((a) => a.status === status);
  if (type) out = out.filter((a) => a.type === type);
  if (afterSeq) out = out.filter((a) => BigInt(a.alertSeq) > BigInt(afterSeq));
  if (beforeSeq) out = out.filter((a) => BigInt(a.alertSeq) < BigInt(beforeSeq));
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

export async function mockApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const [rawPath, query = ""] = path.split("?");
  const s = getScenario();

  // /api/status
  if (rawPath === "/api/status" && method === "GET") {
    return s.statuses as unknown as T;
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

  // /api/residents/:id  (GET)
  const residentMatch = rawPath.match(/^\/api\/residents\/([^/]+)$/);
  if (residentMatch && method === "GET") {
    const id = decodeURIComponent(residentMatch[1]);
    const resident = s.residents.find((r) => r.id === id);
    if (!resident) throw new MockApiError(404, "resident not found");
    return {
      ...resident,
      guardians: s.guardians.filter((g) => g.residentId === id),
      cameras: s.cameras.filter((c) => c.residentId === id),
      status: s.statuses.find((st) => st.residentId === id) ?? null,
      alerts: sortAlertsBySeq(s.alerts.filter((a) => a.residentId === id)),
    } as unknown as T;
  }

  // /api/residents  (GET)
  if (rawPath === "/api/residents" && method === "GET") {
    return s.residents as unknown as T;
  }

  // /api/cameras  (GET)
  if (rawPath === "/api/cameras" && method === "GET") {
    return s.cameras as unknown as T;
  }

  // /api/guardians  (GET)
  if (rawPath === "/api/guardians" && method === "GET") {
    return s.guardians as unknown as T;
  }

  // Mutating admin verbs on known CRUD resources: accept as no-ops (demo never
  // persists CRUD to a backend). Scoped to known resources so a misspelled or
  // unimplemented mutating route surfaces as a missing-route error instead of a
  // silent fake success.
  const adminMutation = /^\/api\/(residents|cameras|guardians)(\/[^/]+)?$/;
  if (
    (method === "POST" || method === "PATCH" || method === "DELETE") &&
    adminMutation.test(rawPath)
  ) {
    return {} as unknown as T;
  }

  throw new MockApiError(404, `no mock route for ${method} ${rawPath}`);
}
