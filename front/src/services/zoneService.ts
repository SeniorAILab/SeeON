// ⚠ 비활 fixture: 런타임 도달 불가(가역 숨김 페이지 전용).
// 재활성 시 실백엔드로 배선하거나 페이지 영구 제거 시 함께 삭제.
// 구역/침대(Zone) + 어르신 배정(ResidentAssignment) fixture 서비스.
import { db } from "./db";
import { delay, uid } from "@/lib/utils";
import type { Resident, ResidentAssignment, Zone, ZoneType } from "@/types";

export interface ZoneWithResident extends Zone {
  resident?: Resident;
}

export const zoneService = {
  async listZones(spaceId: string): Promise<Zone[]> {
    return delay(
      db.zones.filter((z) => z.spaceId === spaceId).sort((a, b) => a.orderIndex - b.orderIndex)
    );
  },

  /** 호실의 침대/구역 + 현재 배정된 어르신 */
  async listZonesWithResidents(spaceId: string): Promise<ZoneWithResident[]> {
    const zones = db.zones
      .filter((z) => z.spaceId === spaceId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return delay(
      zones.map((z) => {
        const asg = db.assignments.find((a) => a.active && a.zoneId === z.id);
        const resident = asg ? db.residents.find((r) => r.id === asg.residentId) : undefined;
        return { ...z, resident };
      })
    );
  },

  async createZone(spaceId: string, name: string, type: ZoneType = "BED"): Promise<Zone> {
    const space = db.spaces.find((s) => s.id === spaceId);
    if (!space) throw new Error("공간을 찾을 수 없습니다.");
    const orderIndex =
      Math.max(-1, ...db.zones.filter((z) => z.spaceId === spaceId).map((z) => z.orderIndex)) + 1;
    const zone: Zone = { id: uid("zone"), facilityId: space.facilityId, spaceId, name, type, orderIndex };
    db.zones.push(zone);
    return delay(zone);
  },

  async deleteZone(zoneId: string): Promise<void> {
    db.zones = db.zones.filter((z) => z.id !== zoneId);
    db.assignments = db.assignments.filter((a) => a.zoneId !== zoneId);
    return delay(undefined);
  },

  /** 어르신을 특정 구역(침대)에 배정. 기존 배정/해당 구역 배정은 정리. */
  async assignResident(residentId: string, spaceId: string, zoneId: string | null): Promise<ResidentAssignment> {
    const resident = db.residents.find((r) => r.id === residentId);
    if (!resident) throw new Error("어르신을 찾을 수 없습니다.");
    // 같은 어르신의 기존 배정 비활성화
    db.assignments.forEach((a) => {
      if (a.residentId === residentId) a.active = false;
      if (zoneId && a.zoneId === zoneId) a.active = false; // 한 침대 1명
    });
    const asg: ResidentAssignment = {
      id: uid("asg"),
      facilityId: resident.facilityId,
      residentId,
      spaceId,
      zoneId,
      active: true,
      startedAt: new Date().toISOString(),
    };
    db.assignments.push(asg);
    return delay(asg);
  },

  async unassignZone(zoneId: string): Promise<void> {
    db.assignments.forEach((a) => {
      if (a.zoneId === zoneId) a.active = false;
    });
    return delay(undefined);
  },

  async listAssignments(facilityId: string): Promise<ResidentAssignment[]> {
    return delay(db.assignments.filter((a) => a.facilityId === facilityId && a.active));
  },

  /** 어르신의 현재 위치 표기: "202호 침대A" */
  locationLabel(residentId: string): string {
    const a = db.assignments.find((x) => x.active && x.residentId === residentId);
    if (!a) return "미배정";
    const space = db.spaces.find((s) => s.id === a.spaceId);
    const zone = a.zoneId ? db.zones.find((z) => z.id === a.zoneId) : undefined;
    return [space?.name, zone?.name].filter(Boolean).join(" ");
  },
};
