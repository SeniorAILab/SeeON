import { describe, expect, it, vi } from "vitest";
import {
  compareAlertSeq,
  createAlertMergeState,
  deriveStatusesFromAlerts,
  alertsForFacility,
  mergeAck,
  mergeAlerts,
  reconcileActiveAlertSnapshot,
  mergeAlertsIntoDashboard,
} from "./alertMerge";
import type { FrontendAlert } from "./api/alertEndpoints";
import type { DashboardResponse } from "@/types";
function alert(overrides: Partial<FrontendAlert> = {}): FrontendAlert {
  return {
    id: "a1",
    alertSeq: "1",
    facilityId: "fac_happy_nokyang",
    residentId: null,
    cameraId: "cam_sp_201",
    spaceId: "sp_201",
    room: "201호",
    eventType: "BED_EXIT",
    riskLevel: "HIGH",
    message: "201호 침상 이탈 감지",
    aiSummary: "침상 이탈이 감지되었습니다.",
    detectedAt: "2026-06-22T00:00:00.000Z",
    kakaoAlertStatus: "PENDING",
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
      id: "fac_happy_nokyang",
      name: "행복요양원 녹양점",
      address: "경기도 의정부시",
      code: "happy-nokyang",
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
    expect(state.highestSeqByFacility.fac_happy_nokyang).toBe("1");
  });

  it("test_alert_seq_comparison_is_numeric_not_lexicographic", () => {
    expect(compareAlertSeq("10", "9")).toBe(1);
    expect(compareAlertSeq("10", "2")).toBe(1);
  });

  it("test_resolve_merge_replaces_alert_by_id", () => {
    const state = createAlertMergeState([alert({ kakaoAlertStatus: "PENDING" })]);
    const next = mergeAck(state, alert({ kakaoAlertStatus: "ACKNOWLEDGED", backendStatus: "RESOLVED" }));
    expect(Object.values(next.byId)).toHaveLength(1);
    expect(next.byId.a1.kakaoAlertStatus).toBe("ACKNOWLEDGED");
  });

  it("test_eventsource_onmessage_default_alert_updates_room_card", () => {
    const statuses = deriveStatusesFromAlerts({}, [alert({ residentId: null, alertSeq: "10" })]);
    expect(statuses.sp_201.status).toBe("DANGER");
    expect(statuses.sp_201.kakaoAlertStatus).toBe("PENDING");
    expect(statuses.sp_201.bedsideActivity).toBe(true);
  });

  it("test_resolve_by_id_merge_clears_active_room_card_danger", () => {
    const active = deriveStatusesFromAlerts({}, [alert({ kakaoAlertStatus: "SENT" })]);
    const cleared = deriveStatusesFromAlerts(
      active,
      [alert({ kakaoAlertStatus: "ACKNOWLEDGED", backendStatus: "RESOLVED" })]
    );

    expect(cleared.sp_201.status).toBe("STABLE");
    expect(cleared.sp_201.kakaoAlertStatus).toBe("ACKNOWLEDGED");
    expect(cleared.sp_201.emergency).toBe(false);
    expect(cleared.sp_201.bedsideActivity).toBe(false);
  });

  it("keeps_room_danger_when_older_resolved_alert_arrives_after_newer_unacknowledged_alert", () => {
    const newerUnresolved = alert({ id: "newer", alertSeq: "10", kakaoAlertStatus: "PENDING" });
    const olderResolved = alert({
      id: "older",
      alertSeq: "9",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[newerUnresolved], [olderResolved]]);

    expect(status.status).toBe("DANGER");
    expect(status.kakaoAlertStatus).toBe("PENDING");
    expect(status.lastDetectedAt).toBe(newerUnresolved.detectedAt);
    expect(status.emergency).toBe(true);
  });

  it("derives_same_room_danger_when_older_resolved_alert_arrives_before_newer_unacknowledged_alert", () => {
    const newerUnresolved = alert({ id: "newer", alertSeq: "10", kakaoAlertStatus: "PENDING" });
    const olderResolved = alert({
      id: "older",
      alertSeq: "9",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[olderResolved], [newerUnresolved]]);

    expect(status.status).toBe("DANGER");
    expect(status.kakaoAlertStatus).toBe("PENDING");
    expect(status.lastDetectedAt).toBe(newerUnresolved.detectedAt);
    expect(status.emergency).toBe(true);
  });

  it("clears_room_danger_when_newest_only_unacknowledged_alert_is_resolved", () => {
    const active = alert({ id: "newest", alertSeq: "10", kakaoAlertStatus: "PENDING" });
    const resolved = alert({
      id: "newest",
      alertSeq: "11",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[active], [resolved]]);

    expect(status.status).toBe("STABLE");
    expect(status.kakaoAlertStatus).toBe("ACKNOWLEDGED");
    expect(status.emergency).toBe(false);
    expect(status.bedsideActivity).toBe(false);
  });

  it("keeps_room_danger_from_newer_unacknowledged_alert_when_older_unacknowledged_alert_is_resolved", () => {
    const older = alert({ id: "older", alertSeq: "9", kakaoAlertStatus: "PENDING" });
    const newer = alert({
      id: "newer",
      alertSeq: "10",
      kakaoAlertStatus: "PENDING",
      aiSummary: "더 최신 침상 이탈입니다.",
      detectedAt: "2026-06-22T00:01:00.000Z",
    });
    const olderResolved = alert({
      id: "older",
      alertSeq: "11",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "RESOLVED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[older, newer], [olderResolved]]);

    expect(status.status).toBe("DANGER");
    expect(status.kakaoAlertStatus).toBe("PENDING");
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
      kakaoAlertStatus: "ACKNOWLEDGED",
      emergency: false,
    }));
    state = mergeAlerts(state, [
      alert({ id: "a-terminal", alertSeq: "10", backendStatus: "NEW", kakaoAlertStatus: "PENDING" }),
    ]);

    const statuses = deriveStatusesFromAlerts({}, alertsForFacility(state, "fac_happy_nokyang"));
    expect(statuses.sp_201.status).toBe("STABLE");
  });

  it("reconciles_empty_active_snapshot_by_clearing_room_danger", () => {
    const active = alert({ id: "active", alertSeq: "20", backendStatus: "NEW" });
    const base = deriveStatusesFromAlerts({}, [active]);
    const reconciled = reconcileActiveAlertSnapshot(createAlertMergeState([active]), "fac_happy_nokyang", []);
    const statuses = deriveStatusesFromAlerts(base, alertsForFacility(reconciled, "fac_happy_nokyang"));

    expect(alertsForFacility(reconciled, "fac_happy_nokyang")).toHaveLength(0);
    expect(statuses.sp_201.status).toBe("STABLE");
  });
  it("test_real_mode_uses_backend_rest_and_dashboard_stream_not_realtime_engine", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_USE_MOCK", "false");
    const { buildSseUrl } = await import("./apiClient");
    expect(buildSseUrl()).toBe("/api/v1/dashboard/stream");
  });
});
