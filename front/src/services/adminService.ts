// ⚠ 비활 fixture: 런타임 도달 불가(가역 숨김 페이지 전용).
// 재활성 시 실백엔드로 배선하거나 페이지 영구 제거 시 함께 삭제.
// 관리자(시설/알림규칙/사용자) CRUD fixture 서비스.
import { db } from "./db";
import { delay, uid } from "@/lib/utils";
import type { AlertRule, Facility, User } from "@/types";

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
