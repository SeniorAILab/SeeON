import { describe, expect, it, vi } from "vitest";
import {
  compareAlertSeq,
  createAlertMergeState,
  deriveStatusesFromAlerts,
  RESOLVED_RETENTION_LIMIT,
  alertsForFacility,
  mergeAck,
  mergeAlerts,
  mergeAlertUpdates,
  isActiveAlert,
  reconcileActiveAlertSnapshot,
  mergeAlertsIntoDashboard,
  mergeAlertUpdatesIntoDashboard,
} from "./alertMerge";
import type { AlertUpdateDelta } from "./alertMerge";
import type { FrontendAlert } from "./api/alertEndpoints";
import type { DashboardResponse, SpaceStatus } from "@/types";
const SCOPED_FACILITY_ID = "fac_happy_nokyang";

function alert(overrides: Partial<FrontendAlert> = {}): FrontendAlert {
  return {
    id: "a1",
    alertSeq: "1",
    facilityId: SCOPED_FACILITY_ID,
    residentId: null,
    cameraId: "cam_sp_201",
    spaceId: "sp_201",
    room: "201호",
    eventType: "BED_EXIT",
    riskLevel: "HIGH",
    message: "201호 침상 이탈 감지",
    aiSummary: "침상 이탈이 감지되었습니다.",
    detectedAt: "2026-06-22T00:00:00.000Z",
    alertStatus: "PENDING",
    actions: [],
    confidence: 0.91,
    emergency: true,
    backendStatus: "NEW",
    backendType: "bed-exit",
    ...overrides,
  };
}

function dashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    facility: {
      id: SCOPED_FACILITY_ID,
      name: "행복요양원 녹양점",
      address: "경기도 의정부시",
      phone: "031-123-4567",
    },
    floors: [],
    spaces: [],
    statuses: {},
    summary: {
      totalSpaces: 0,
      stable: 0,
      caution: 0,
      danger: 0,
      checkNeeded: 0,
      unacknowledged: 0,
    },
    unacknowledgedEvents: [],
    ...overrides,
  };
}

function roomStatusAfterMerges(batches: FrontendAlert[][]) {
  let data = dashboard();
  for (const batch of batches) data = mergeAlertsIntoDashboard(data, batch);
  return data.statuses.sp_201;
}


describe("alertMerge", () => {
  it("test_alert_seq_dedup_across_rest_dashboard_stream_replay_live_and_polling", () => {
    let state = createAlertMergeState([alert()]);
    state = mergeAlerts(state, [alert(), alert(), alert()]);
    expect(Object.values(state.byId)).toHaveLength(1);
    expect(state.highestSeqByFacility[SCOPED_FACILITY_ID]).toBe("1");
  });

  it("test_alert_seq_comparison_is_numeric_not_lexicographic", () => {
    expect(compareAlertSeq("10", "9")).toBe(1);
    expect(compareAlertSeq("10", "2")).toBe(1);
  });

  it("test_resolve_merge_replaces_alert_by_id", () => {
    const state = createAlertMergeState([alert({ alertStatus: "PENDING" })]);
    const next = mergeAck(state, alert({ alertStatus: "ACKNOWLEDGED", backendStatus: "RESOLVED" }));
    expect(Object.values(next.byId)).toHaveLength(1);
    expect(next.byId.a1.alertStatus).toBe("ACKNOWLEDGED");
  });

  it("test_eventsource_onmessage_default_alert_updates_room_card", () => {
    const statuses = deriveStatusesFromAlerts({}, [alert({ residentId: null, alertSeq: "10" })]);
    expect(statuses.sp_201.status).toBe("DANGER");
    expect(statuses.sp_201.alertStatus).toBe("PENDING");
    expect(statuses.sp_201.bedsideActivity).toBe(true);
  });
  it("preserves_ai_summary_for_active_danger_alert", () => {
    const active = alert({ aiSummary: "활성 위험 이벤트입니다." });
    const statuses = deriveStatusesFromAlerts({}, [active]);

    expect(statuses.sp_201.status).toBe("DANGER");
    expect(statuses.sp_201.aiSummary).toBe(active.aiSummary);
  });


  it("test_resolve_by_id_merge_clears_active_room_card_danger", () => {
    const active = deriveStatusesFromAlerts({}, [alert({ alertStatus: "SENT" })]);
    const cleared = deriveStatusesFromAlerts(
      active,
      [alert({ alertStatus: "ACKNOWLEDGED", backendStatus: "RESOLVED" })]
    );

    expect(cleared.sp_201.status).toBe("STABLE");
    expect(cleared.sp_201.alertStatus).toBe("ACKNOWLEDGED");
    expect(cleared.sp_201.emergency).toBe(false);
    expect(cleared.sp_201.bedsideActivity).toBe(false);
    expect(cleared.sp_201.aiSummary).toBeUndefined();
  });

  it("keeps_room_danger_when_older_resolved_alert_arrives_after_newer_unacknowledged_alert", () => {
    const newerUnresolved = alert({ id: "newer", alertSeq: "10", alertStatus: "PENDING" });
    const olderResolved = alert({
      id: "older",
      alertSeq: "9",
      alertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[newerUnresolved], [olderResolved]]);

    expect(status.status).toBe("DANGER");
    expect(status.alertStatus).toBe("PENDING");
    expect(status.lastDetectedAt).toBe(newerUnresolved.detectedAt);
    expect(status.emergency).toBe(true);
  });

  it("derives_same_room_danger_when_older_resolved_alert_arrives_before_newer_unacknowledged_alert", () => {
    const newerUnresolved = alert({ id: "newer", alertSeq: "10", alertStatus: "PENDING" });
    const olderResolved = alert({
      id: "older",
      alertSeq: "9",
      alertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[olderResolved], [newerUnresolved]]);

    expect(status.status).toBe("DANGER");
    expect(status.alertStatus).toBe("PENDING");
    expect(status.lastDetectedAt).toBe(newerUnresolved.detectedAt);
    expect(status.emergency).toBe(true);
  });

  it("clears_room_danger_when_newest_only_unacknowledged_alert_is_resolved", () => {
    const active = alert({ id: "newest", alertSeq: "10", alertStatus: "PENDING" });
    const resolved = alert({
      id: "newest",
      alertSeq: "11",
      alertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[active], [resolved]]);

    expect(status.status).toBe("STABLE");
    expect(status.alertStatus).toBe("ACKNOWLEDGED");
    expect(status.emergency).toBe(false);
    expect(status.bedsideActivity).toBe(false);
    expect(status.aiSummary).toBeUndefined();
  });
  it("clears_room_card_when_sse_alert_updated_resolves_active_alert", () => {
    const active = alert({
      id: "sse-resolve",
      alertSeq: "20",
      spaceId: "sp_201",
      alertStatus: "PENDING",
      backendStatus: "NEW",
      emergency: true,
      aiSummary: "SSE 활성 위험 이벤트입니다.",
    });
    const seeded = mergeAlertsIntoDashboard(dashboard(), [active]);

    const resolved = mergeAlertUpdatesIntoDashboard(seeded, [
      {
        id: active.id,
        alertSeq: "21",
        spaceId: "sp_201",
        status: "RESOLVED",
        resolvedAt: "2026-06-22T00:02:00.000Z",
      },
    ]);

    expect(resolved.statuses.sp_201.status).toBe("STABLE");
    expect(resolved.statuses.sp_201.emergency).toBe(false);
    expect(resolved.statuses.sp_201.aiSummary).toBeUndefined();
  });

  it("keeps_room_danger_from_newer_unacknowledged_alert_when_older_unacknowledged_alert_is_resolved", () => {
    const older = alert({ id: "older", alertSeq: "9", alertStatus: "PENDING" });
    const newer = alert({
      id: "newer",
      alertSeq: "10",
      alertStatus: "PENDING",
      aiSummary: "더 최신 침상 이탈입니다.",
      detectedAt: "2026-06-22T00:01:00.000Z",
    });
    const olderResolved = alert({
      id: "older",
      alertSeq: "11",
      alertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[older, newer], [olderResolved]]);

    expect(status.status).toBe("DANGER");
    expect(status.alertStatus).toBe("PENDING");
    expect(status.aiSummary).toBe(newer.aiSummary);
    expect(status.lastDetectedAt).toBe(newer.detectedAt);
  });

  it("makes_low_probability_fall_danger_because_probability_is_display_only", () => {
    const statuses = deriveStatusesFromAlerts({}, [
      alert({
        id: "low-fall",
        backendType: "fall",
        eventType: "FALL_RISK",
        riskLevel: "LOW",
        confidence: 0.2,
        emergency: false,
      }),
    ]);

    expect(statuses.sp_201.status).toBe("DANGER");
  });

  it("does_not_make_detection_lost_red", () => {
    const statuses = deriveStatusesFromAlerts({}, [
      alert({
        id: "camera-lost",
        backendType: "detection-lost",
        eventType: "OTHER",
        riskLevel: "HIGH",
        confidence: 1,
      }),
    ]);

    expect(statuses.sp_201.status).toBe("STABLE");
  });

  it("keeps_resolved_terminal_when_stale_creation_frame_arrives_late", () => {
    let state = createAlertMergeState([
      alert({ id: "a-terminal", alertSeq: "10", backendStatus: "NEW" }),
    ]);
    state = mergeAck(state, alert({
      id: "a-terminal",
      alertSeq: "11",
      backendStatus: "RESOLVED",
      alertStatus: "ACKNOWLEDGED",
      emergency: false,
    }));
    state = mergeAlerts(state, [
      alert({ id: "a-terminal", alertSeq: "10", backendStatus: "NEW", alertStatus: "PENDING" }),
    ]);

    const statuses = deriveStatusesFromAlerts({}, alertsForFacility(state, SCOPED_FACILITY_ID));
    expect(statuses.sp_201.status).toBe("STABLE");
  });

  it("reconciles_empty_active_snapshot_by_clearing_room_danger", () => {
    const active = alert({ id: "active", alertSeq: "20", backendStatus: "NEW" });
    const activeBase = deriveStatusesFromAlerts({}, [active]);
    const base = {
      ...activeBase,
      sp_201: {
        ...activeBase.sp_201,
        prolongedInactivity: true,
        soloMovementAttempt: true,
      },
    };
    const reconciled = reconcileActiveAlertSnapshot(createAlertMergeState([active]), SCOPED_FACILITY_ID, []);
    const statuses = deriveStatusesFromAlerts(base, alertsForFacility(reconciled, SCOPED_FACILITY_ID));

    expect(alertsForFacility(reconciled, SCOPED_FACILITY_ID)).toHaveLength(0);
    expect(statuses.sp_201.status).toBe("STABLE");
    expect(statuses.sp_201.aiSummary).toBeUndefined();
    expect(statuses.sp_201.prolongedInactivity).toBeUndefined();
    expect(statuses.sp_201.soloMovementAttempt).toBeUndefined();
  });
  it("test_real_mode_uses_backend_rest_and_dashboard_stream", async () => {
    vi.resetModules();
    const { buildSseUrl } = await import("./apiClient");
    expect(buildSseUrl()).toBe("/api/v1/dashboard/stream");
  });
});

describe("freshness-preserved — 신선도는 위험도와 직교한다", () => {
  function baseStatus(overrides: Partial<SpaceStatus> = {}): SpaceStatus {
    return {
      id: "status-sp_205",
      spaceId: "sp_205",
      peopleCount: 0,
      movementLevel: "LOW",
      fallRiskLevel: "LOW",
      status: "STABLE",
      connection: "STALE",
      lastSeenAt: "2026-08-01T06:47:44.174Z",
      lastDetectedAt: "",
      alertStatus: "NONE",
      ...overrides,
    };
  }

  it("DANGER 알림이 들어와도 STALE 연결 상태가 지워지지 않는다", () => {
    const base = { sp_205: baseStatus() };
    const statuses = deriveStatusesFromAlerts(base, [alert({ spaceId: "sp_205" })]);
    expect(statuses.sp_205.status).toBe("DANGER");
    expect(statuses.sp_205.connection).toBe("STALE");
    expect(statuses.sp_205.lastSeenAt).toBe("2026-08-01T06:47:44.174Z");
  });

  it("LIVE 연결 상태도 DANGER 전이에서 보존된다", () => {
    const base = { sp_205: baseStatus({ connection: "LIVE", lastSeenAt: "2026-08-03T11:59:30.000Z" }) };
    const statuses = deriveStatusesFromAlerts(base, [alert({ spaceId: "sp_205" })]);
    expect(statuses.sp_205.status).toBe("DANGER");
    expect(statuses.sp_205.connection).toBe("LIVE");
  });

  it("알림이 해소돼 STABLE로 돌아가도 신선도는 그대로다", () => {
    const base = { sp_205: baseStatus({ connection: "STALE" }) };
    const resolved = deriveStatusesFromAlerts(base, [
      alert({ spaceId: "sp_205", backendStatus: "RESOLVED", alertStatus: "ACKNOWLEDGED" }),
    ]);
    expect(resolved.sp_205.status).toBe("STABLE");
    expect(resolved.sp_205.connection).toBe("STALE");
  });

  it("previous가 없는 공간은 보수적으로 STALE로 생성된다", () => {
    const statuses = deriveStatusesFromAlerts({}, [alert({ spaceId: "sp_999" })]);
    expect(statuses.sp_999.connection).toBe("STALE");
    expect(statuses.sp_999.lastSeenAt).toBeNull();
  });
});

describe("bounded-merge — TV 상시 구동에서 메모리가 무한히 늘지 않는다", () => {
  function resolvedAlert(seq: number) {
    return alert({
      id: `alert_${seq}`,
      alertSeq: String(seq),
      spaceId: `sp_${seq % 7}`,
      backendStatus: "RESOLVED",
      alertStatus: "ACKNOWLEDGED",
    });
  }

  it("해결된 알림은 보관 상한을 넘지 않는다", () => {
    let state = createAlertMergeState();
    // 30일치 이벤트를 흉내낸다.
    for (let i = 1; i <= RESOLVED_RETENTION_LIMIT + 300; i += 1) {
      state = mergeAlerts(state, [resolvedAlert(i)]);
    }

    const stored = Object.values(state.byId);
    expect(stored.length).toBeLessThanOrEqual(RESOLVED_RETENTION_LIMIT);
  });

  it("tombstone도 함께 정리되어 따로 자라지 않는다", () => {
    let state = createAlertMergeState();
    for (let i = 1; i <= RESOLVED_RETENTION_LIMIT + 300; i += 1) {
      state = mergeAlerts(state, [resolvedAlert(i)]);
    }

    expect(Object.keys(state.terminalResolvedSeqById).length).toBeLessThanOrEqual(
      RESOLVED_RETENTION_LIMIT
    );
  });

  it("가장 최근 해결 알림이 남고 오래된 것이 밀려난다", () => {
    let state = createAlertMergeState();
    for (let i = 1; i <= RESOLVED_RETENTION_LIMIT + 50; i += 1) {
      state = mergeAlerts(state, [resolvedAlert(i)]);
    }

    const newest = RESOLVED_RETENTION_LIMIT + 50;
    expect(state.byId[`alert_${newest}`]).toBeDefined();
    expect(state.byId["alert_1"]).toBeUndefined();
  });

  it("활성 알림은 상한과 무관하게 유지된다", () => {
    let state = createAlertMergeState();
    // 활성 알림 5건 + 해결 알림 대량.
    for (let i = 1; i <= 5; i += 1) {
      state = mergeAlerts(state, [alert({ id: `active_${i}`, alertSeq: String(100000 + i), spaceId: `sp_a${i}` })]);
    }
    for (let i = 1; i <= RESOLVED_RETENTION_LIMIT + 300; i += 1) {
      state = mergeAlerts(state, [resolvedAlert(i)]);
    }

    for (let i = 1; i <= 5; i += 1) {
      expect(state.byId[`active_${i}`]).toBeDefined();
    }
  });
});

describe("ACKED는 확인 전과 구분된다 (I4)", () => {
  // 요양보호사가 "확인"을 누르면 SSE alert-updated 델타로 도착한다.
  // 이 경로가 ACKED를 PENDING으로 뭉개면 화면이 눌러도 그대로여서
  // 다른 사람이 같은 방으로 또 달려간다.
  function ackDelta(id: string, spaceId: string): AlertUpdateDelta {
    return { id, alertSeq: "2", spaceId, status: "ACKED" } as AlertUpdateDelta;
  }

  it("확인 델타가 도착하면 ACKNOWLEDGED로 바뀐다", () => {
    const base = createAlertMergeState([alert({ id: "a1", spaceId: "sp_205" })]);

    const merged = mergeAlertUpdates(base, [ackDelta("a1", "sp_205")]);

    expect(merged.byId.a1.alertStatus).toBe("ACKNOWLEDGED");
  });

  it("확인해도 알림은 활성으로 남아 방이 DANGER를 유지한다", () => {
    // 확인은 해결이 아니다. 아직 사람이 가는 중이므로 위험 표시는 유지된다.
    const base = createAlertMergeState([alert({ id: "a1", spaceId: "sp_205" })]);

    const merged = mergeAlertUpdates(base, [ackDelta("a1", "sp_205")]);
    const statuses = deriveStatusesFromAlerts({}, alertsForFacility(merged, SCOPED_FACILITY_ID));

    expect(isActiveAlert(merged.byId.a1)).toBe(true);
    expect(statuses.sp_205.status).toBe("DANGER");
    expect(statuses.sp_205.alertStatus).toBe("ACKNOWLEDGED");
  });

  it("확인 전 상태는 PENDING으로 남아 구분된다", () => {
    const base = createAlertMergeState([alert({ id: "a2", spaceId: "sp_206" })]);

    const statuses = deriveStatusesFromAlerts({}, alertsForFacility(base, SCOPED_FACILITY_ID));

    expect(statuses.sp_206.alertStatus).toBe("PENDING");
  });
});
