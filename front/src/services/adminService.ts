// 관리자(시설/층/공간/알림규칙/사용자) CRUD 서비스 (mock)
// 실제: /api/floors, /api/spaces, /api/facilities, /api/alert-rules ...
import { db } from "./db";
import { delay, uid } from "@/lib/utils";
import type { AlertRule, Facility, Floor, Space, User } from "@/types";

export const adminService = {
  // ---- Facility ----
  async listFacilities(): Promise<Facility[]> {
    return delay([...db.facilities]);
  },
  async updateFacility(id: string, patch: Partial<Facility>): Promise<Facility> {
    const f = db.facilities.find((x) => x.id === id);
    if (!f) throw new Error("시설을 찾을 수 없습니다.");
    Object.assign(f, patch);
    return delay(f);
  },

  // ---- Floor ----
  async listFloors(facilityId: string): Promise<Floor[]> {
    return delay(
      db.floors
        .filter((f) => f.facilityId === facilityId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    );
  },
  async createFloor(facilityId: string, name: string): Promise<Floor> {
    const orderIndex =
      Math.max(0, ...db.floors.filter((f) => f.facilityId === facilityId).map((f) => f.orderIndex)) +
      1;
    const floor: Floor = { id: uid("fl"), facilityId, name, orderIndex };
    db.floors.push(floor);
    return delay(floor);
  },
  async updateFloor(id: string, patch: Partial<Floor>): Promise<Floor> {
    const f = db.floors.find((x) => x.id === id);
    if (!f) throw new Error("층을 찾을 수 없습니다.");
    Object.assign(f, patch);
    return delay(f);
  },
  async deleteFloor(id: string): Promise<void> {
    if (db.spaces.some((s) => s.floorId === id)) {
      throw new Error("해당 층에 공간이 남아 있어 삭제할 수 없습니다.");
    }
    db.floors = db.floors.filter((f) => f.id !== id);
    return delay(undefined);
  },
  async reorderFloor(id: string, direction: "up" | "down"): Promise<void> {
    const f = db.floors.find((x) => x.id === id);
    if (!f) return;
    const siblings = db.floors
      .filter((x) => x.facilityId === f.facilityId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = siblings.findIndex((x) => x.id === id);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[swapWith];
    const tmp = a.orderIndex;
    a.orderIndex = b.orderIndex;
    b.orderIndex = tmp;
    return delay(undefined);
  },

  // ---- Space ----
  async listSpaces(facilityId: string): Promise<Space[]> {
    return delay(db.spaces.filter((s) => s.facilityId === facilityId));
  },
  async createSpace(input: Omit<Space, "id">): Promise<Space> {
    const space: Space = { ...input, id: uid("sp") };
    db.spaces.push(space);
    return delay(space);
  },
  async updateSpace(id: string, patch: Partial<Space>): Promise<Space> {
    const s = db.spaces.find((x) => x.id === id);
    if (!s) throw new Error("공간을 찾을 수 없습니다.");
    Object.assign(s, patch);
    return delay(s);
  },
  async deleteSpace(id: string): Promise<void> {
    db.spaces = db.spaces.filter((s) => s.id !== id);
    db.statuses = db.statuses.filter((s) => s.spaceId !== id);
    return delay(undefined);
  },

  // ---- AlertRule ----
  async listAlertRules(facilityId: string): Promise<AlertRule[]> {
    return delay(db.alertRules.filter((r) => r.facilityId === facilityId));
  },
  async createAlertRule(input: Omit<AlertRule, "id">): Promise<AlertRule> {
    const rule: AlertRule = { ...input, id: uid("rule") };
    db.alertRules.push(rule);
    return delay(rule);
  },
  async updateAlertRule(id: string, patch: Partial<AlertRule>): Promise<AlertRule> {
    const r = db.alertRules.find((x) => x.id === id);
    if (!r) throw new Error("알림 규칙을 찾을 수 없습니다.");
    Object.assign(r, patch);
    return delay(r);
  },
  async deleteAlertRule(id: string): Promise<void> {
    db.alertRules = db.alertRules.filter((r) => r.id !== id);
    return delay(undefined);
  },

  // ---- User ----
  async listUsers(facilityId: string | null): Promise<User[]> {
    const list = db.users
      .filter((u) => (facilityId ? u.facilityId === facilityId : true))
      .map(({ password: _pw, ...rest }) => rest);
    return delay(list);
  },
};
