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

  it("POST /api/residents adds a resident the next list reflects", async () => {
    const before = await mockApi<DemoResident[]>("/api/residents");
    const created = await mockApi<DemoResident>("/api/residents", {
      method: "POST",
      body: JSON.stringify({ name: "테스트", room: "999" }),
    });
    expect(created.id).toBeTruthy();
    const after = await mockApi<DemoResident[]>("/api/residents");
    expect(after).toHaveLength(before.length + 1);
    expect(after.some((r) => r.id === created.id)).toBe(true);
  });

  it("DELETE /api/cameras/:id removes it from the list", async () => {
    const before = await mockApi<{ id: string }[]>("/api/cameras");
    const target = before[0].id;
    await mockApi(`/api/cameras/${target}`, { method: "DELETE" });
    const after = await mockApi<{ id: string }[]>("/api/cameras");
    expect(after.some((c) => c.id === target)).toBe(false);
  });

  it("PATCH /api/guardians/:id 404s for an unknown id", async () => {
    await expect(
      mockApi("/api/guardians/nope", {
        method: "PATCH",
        body: JSON.stringify({ name: "x" }),
      }),
    ).rejects.toBeInstanceOf(MockApiError);
  });

  it("throws MockApiError for an unknown alert", async () => {
    await expect(mockApi("/api/alerts/nope")).rejects.toBeInstanceOf(
      MockApiError,
    );
  });
});
