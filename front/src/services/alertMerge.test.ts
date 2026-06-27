import { describe, expect, it, vi } from "vitest";
import {
  compareAlertSeq,
  createAlertMergeState,
  deriveStatusesFromAlerts,
  mergeAck,
  mergeAlerts,
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

  it("test_ack_merge_replaces_alert_by_id", () => {
    const state = createAlertMergeState([alert({ kakaoAlertStatus: "PENDING" })]);
    const next = mergeAck(state, alert({ kakaoAlertStatus: "ACKNOWLEDGED", backendStatus: "ACKED" }));
    expect(Object.values(next.byId)).toHaveLength(1);
    expect(next.byId.a1.kakaoAlertStatus).toBe("ACKNOWLEDGED");
  });

  it("test_eventsource_onmessage_default_alert_updates_room_card", () => {
    const statuses = deriveStatusesFromAlerts({}, [alert({ residentId: null, alertSeq: "10" })]);
    expect(statuses.sp_201.status).toBe("DANGER");
    expect(statuses.sp_201.kakaoAlertStatus).toBe("PENDING");
    expect(statuses.sp_201.bedsideActivity).toBe(true);
  });

  it("test_ack_by_id_merge_clears_active_room_card_danger", () => {
    const active = deriveStatusesFromAlerts({}, [alert({ kakaoAlertStatus: "SENT" })]);
    const cleared = deriveStatusesFromAlerts(
      active,
      [alert({ kakaoAlertStatus: "ACKNOWLEDGED", backendStatus: "ACKED" })]
    );

    expect(cleared.sp_201.status).toBe("STABLE");
    expect(cleared.sp_201.kakaoAlertStatus).toBe("ACKNOWLEDGED");
    expect(cleared.sp_201.emergency).toBe(false);
    expect(cleared.sp_201.bedsideActivity).toBe(false);
  });

  it("keeps_room_danger_when_older_acked_alert_arrives_after_newer_unacknowledged_alert", () => {
    const newerUnacked = alert({ id: "newer", alertSeq: "10", kakaoAlertStatus: "PENDING" });
    const olderAcked = alert({
      id: "older",
      alertSeq: "9",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "ACKED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[newerUnacked], [olderAcked]]);

    expect(status.status).toBe("DANGER");
    expect(status.kakaoAlertStatus).toBe("PENDING");
    expect(status.lastDetectedAt).toBe(newerUnacked.detectedAt);
    expect(status.emergency).toBe(true);
  });

  it("derives_same_room_danger_when_older_acked_alert_arrives_before_newer_unacknowledged_alert", () => {
    const newerUnacked = alert({ id: "newer", alertSeq: "10", kakaoAlertStatus: "PENDING" });
    const olderAcked = alert({
      id: "older",
      alertSeq: "9",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "ACKED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[olderAcked], [newerUnacked]]);

    expect(status.status).toBe("DANGER");
    expect(status.kakaoAlertStatus).toBe("PENDING");
    expect(status.lastDetectedAt).toBe(newerUnacked.detectedAt);
    expect(status.emergency).toBe(true);
  });

  it("clears_room_danger_when_newest_only_unacknowledged_alert_is_acked", () => {
    const active = alert({ id: "newest", alertSeq: "10", kakaoAlertStatus: "PENDING" });
    const acked = alert({
      id: "newest",
      alertSeq: "11",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "ACKED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[active], [acked]]);

    expect(status.status).toBe("STABLE");
    expect(status.kakaoAlertStatus).toBe("ACKNOWLEDGED");
    expect(status.emergency).toBe(false);
    expect(status.bedsideActivity).toBe(false);
  });

  it("keeps_room_danger_from_newer_unacknowledged_alert_when_older_unacknowledged_alert_is_acked", () => {
    const older = alert({ id: "older", alertSeq: "9", kakaoAlertStatus: "PENDING" });
    const newer = alert({
      id: "newer",
      alertSeq: "10",
      kakaoAlertStatus: "PENDING",
      aiSummary: "더 최신 침상 이탈입니다.",
      detectedAt: "2026-06-22T00:01:00.000Z",
    });
    const olderAcked = alert({
      id: "older",
      alertSeq: "11",
      kakaoAlertStatus: "ACKNOWLEDGED",
      backendStatus: "ACKED",
      emergency: false,
    });

    const status = roomStatusAfterMerges([[older, newer], [olderAcked]]);

    expect(status.status).toBe("DANGER");
    expect(status.kakaoAlertStatus).toBe("PENDING");
    expect(status.aiSummary).toBe(newer.aiSummary);
    expect(status.lastDetectedAt).toBe(newer.detectedAt);
  });
  it("test_real_mode_uses_backend_rest_and_dashboard_stream_not_realtime_engine", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_USE_MOCK", "false");
    const { buildSseUrl } = await import("./apiClient");
    expect(buildSseUrl()).toBe("/api/v1/dashboard/stream");
  });
});
