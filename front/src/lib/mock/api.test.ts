import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, MockApiError } from "./api";
import { __resetScenario } from "./scenario";
import type { DemoResident, ResidentStatus, SseAlert } from "./types";

describe("mock api router", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetScenario();
  });

  it("GET /api/status returns the status read model", async () => {
    const statuses = await mockApi<ResidentStatus[]>("/api/status");
    expect(statuses).toHaveLength(16);
  });

  it("GET /api/alerts filters by status", async () => {
    const news = await mockApi<SseAlert[]>("/api/alerts?status=NEW");
    expect(news.length).toBeGreaterThan(0);
    expect(news.every((a) => a.status === "NEW")).toBe(true);
  });

  it("GET /api/alerts honors limit", async () => {
    const five = await mockApi<SseAlert[]>("/api/alerts?limit=5");
    expect(five).toHaveLength(5);
  });

  it("GET /api/alerts filters by residentId", async () => {
    const list = await mockApi<SseAlert[]>("/api/alerts?residentId=res-01");
    expect(list.every((a) => a.residentId === "res-01")).toBe(true);
  });

  it("PATCH /api/alerts/:id/ack acknowledges the alert", async () => {
    const news = await mockApi<SseAlert[]>("/api/alerts?status=NEW");
    const target = news[0];
    const acked = await mockApi<SseAlert>(`/api/alerts/${target.id}/ack`, {
      method: "PATCH",
    });
    expect(acked.status).toBe("ACKED");
  });

  it("GET /api/residents/:id returns flat resident shape", async () => {
    const detail = await mockApi<DemoResident>("/api/residents/res-01");
    expect(detail.id).toBe("res-01");
    expect(typeof detail.name).toBe("string");
    expect("guardians" in detail).toBe(false);
    expect("alerts" in detail).toBe(false);
  });

  it("treats mutating admin verbs as no-ops", async () => {
    const result = await mockApi<Record<string, unknown>>("/api/cameras/cam-01", {
      method: "DELETE",
    });
    expect(result).toEqual({});
  });

  it("throws MockApiError for an unknown alert", async () => {
    await expect(mockApi("/api/alerts/nope")).rejects.toBeInstanceOf(
      MockApiError,
    );
  });
});
