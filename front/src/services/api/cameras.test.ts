import { describe, expect, it } from "vitest";
import { buildFreshnessBySpace, resolveCameraConnection, type SpaceFreshness } from "./cameras";
import type { CameraStatus } from "./cameras";
import { STALE_CUTOFF_MS } from "@/types";

const SCOPED_FACILITY_ID = "fac_happy_nokyang";
const NOW = Date.parse("2026-08-03T12:00:00.000Z");

function camera(overrides: Partial<CameraStatus> & Pick<CameraStatus, "id" | "spaceId">): CameraStatus {
  return {
    facilityId: SCOPED_FACILITY_ID,
    online: true,
    lastSeenAt: null,
    ...overrides,
  };
}

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("resolveCameraConnection — stale-boundary", () => {
  it("정확히 3분(180000ms) 경과는 LIVE로 남는다", () => {
    expect(resolveCameraConnection(isoAgo(STALE_CUTOFF_MS), NOW)).toBe("LIVE");
  });

  it("3분을 1ms라도 넘기면 STALE이 된다", () => {
    expect(resolveCameraConnection(isoAgo(STALE_CUTOFF_MS + 1), NOW)).toBe("STALE");
  });

  it("방금 본 카메라는 LIVE다", () => {
    expect(resolveCameraConnection(isoAgo(0), NOW)).toBe("LIVE");
  });

  it("lastSeenAt이 null이면 한 번도 못 본 것이므로 STALE이다", () => {
    expect(resolveCameraConnection(null, NOW)).toBe("STALE");
  });

  it("파싱할 수 없는 값도 STALE로 떨어진다", () => {
    expect(resolveCameraConnection("not-a-date", NOW)).toBe("STALE");
    expect(resolveCameraConnection("", NOW)).toBe("STALE");
    expect(resolveCameraConnection(undefined, NOW)).toBe("STALE");
  });
});

describe("resolveCameraConnection — online 필드를 신뢰하지 않는다", () => {
  it("프로덕션 상태(online=true, lastSeenAt 2일 전)를 STALE로 판정한다", () => {
    // 프로덕션 실측: 카메라 7대가 전부 online=true인데 last_seen_at은 2일 전.
    // online은 detection-lost 이벤트로만 false가 되므로 신뢰할 수 없다.
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const bySpace = buildFreshnessBySpace(
      [camera({ id: "cam_sp_205", spaceId: "sp_205", online: true, lastSeenAt: isoAgo(twoDaysMs) })],
      NOW
    );
    expect(bySpace.sp_205.connection).toBe("STALE");
  });
});

describe("buildFreshnessBySpace", () => {
  it("spaceId 기준으로 신선도와 lastSeenAt을 그대로 실어준다", () => {
    const live = isoAgo(1_000);
    const bySpace = buildFreshnessBySpace(
      [
        camera({ id: "cam_sp_205", spaceId: "sp_205", lastSeenAt: live }),
        camera({ id: "cam_sp_301", spaceId: "sp_301", lastSeenAt: isoAgo(STALE_CUTOFF_MS + 1) }),
      ],
      NOW
    );
    expect(bySpace).toEqual<Record<string, SpaceFreshness>>({
      sp_205: { connection: "LIVE", lastSeenAt: live },
      sp_301: { connection: "STALE", lastSeenAt: isoAgo(STALE_CUTOFF_MS + 1) },
    });
  });

  it("카메라가 없는 공간은 맵에 나타나지 않는다", () => {
    expect(buildFreshnessBySpace([], NOW)).toEqual({});
  });

  it("같은 공간에 여러 카메라가 들어와도 더 최근 heartbeat가 이긴다", () => {
    const newer = isoAgo(1_000);
    const bySpace = buildFreshnessBySpace(
      [
        camera({ id: "cam_a", spaceId: "sp_205", lastSeenAt: isoAgo(STALE_CUTOFF_MS + 1) }),
        camera({ id: "cam_b", spaceId: "sp_205", lastSeenAt: newer }),
      ],
      NOW
    );
    expect(bySpace.sp_205).toEqual({ connection: "LIVE", lastSeenAt: newer });
  });

  it("lastSeenAt이 null인 카메라는 실제 값이 있는 카메라를 밀어내지 않는다", () => {
    const seen = isoAgo(1_000);
    const bySpace = buildFreshnessBySpace(
      [
        camera({ id: "cam_a", spaceId: "sp_205", lastSeenAt: seen }),
        camera({ id: "cam_b", spaceId: "sp_205", lastSeenAt: null }),
      ],
      NOW
    );
    expect(bySpace.sp_205).toEqual({ connection: "LIVE", lastSeenAt: seen });
  });
});
