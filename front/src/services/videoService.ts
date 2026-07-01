// =============================================================
// 영상(이슈 근거 클립) 서비스 — 보안 경계
// 정책:
//  · 실시간 CCTV 탐색 불가 — 이벤트에 연결된 클립만 조회.
//  · clipUrl 직접 노출 금지, signed URL(토큰+만료) 발급 후에만 재생.
//  · 모든 접근을 VideoAccessLog 로 기록(누가/언제/무엇을).
//  · 다운로드 기본 비활성화, 보관기간(expiresAt) 경과 시 EXPIRED.
//
// ★ 실제 연동 지점 ★
//  - getEventVideo  → GET /api/events/:eventId/video (서버에서 권한 재검증)
//  - getSignedUrl   → GET /api/videos/:id/signed-url (S3/NAS presign)
//  - logAccess      → POST /api/videos/:id/access-log
//  서버 측에서도 동일 권한 검증을 반드시 수행해야 한다(프론트 가드는 보조).
// =============================================================
import { db } from "./db";
import { delay, uid } from "@/lib/utils";
import { canAdmin } from "@/lib/rolePolicy";
import type {
  SignedVideoUrl,
  User,
  VideoAccessAction,
  VideoAccessLog,
  VideoClip,
} from "@/types";

export class VideoPermissionError extends Error {
  constructor() {
    super("영상 확인 권한이 없습니다. 관리자에게 문의해주세요.");
    this.name = "VideoPermissionError";
  }
}

function assertAdmin(user: User | null): asserts user is User {
  if (!canAdmin(user)) throw new VideoPermissionError();
}

export const videoService = {
  /** 이벤트에 연결된 클립 메타 조회(관리자 전용) + VIEW 로그 */
  async getEventVideo(eventId: string, user: User | null): Promise<VideoClip | null> {
    assertAdmin(user);
    const clip = db.videoClips.find((c) => c.eventId === eventId);
    if (!clip) return delay(null);
    // 같은 시설만 접근 가능(멀티테넌트 격리)
    if (user.facilityId && clip.facilityId !== user.facilityId) throw new VideoPermissionError();
    await this.logAccess(clip.id, user, "VIEW");
    return delay(clip);
  },

  /** 임시 접근 URL 발급(관리자 권한 확인 후). 실제로는 S3/NAS presign. */
  async getSignedUrl(videoClipId: string, user: User | null): Promise<SignedVideoUrl> {
    assertAdmin(user);
    const clip = db.videoClips.find((c) => c.id === videoClipId);
    if (!clip) throw new Error("클립을 찾을 수 없습니다.");
    if (clip.storageStatus !== "AVAILABLE") {
      throw new Error("현재 재생할 수 없는 클립입니다.");
    }
    const exp = Date.now() + 5 * 60_000; // 5분 만료
    const token = `${uid("tok")}.${exp}`;
    await this.logAccess(clip.id, user, "PLAY");
    return delay({
      url: `https://media.senai.example/clip/${clip.id}?token=${token}&exp=${exp}`,
      expiresAt: new Date(exp).toISOString(),
    });
  },

  /** 접근 로그 기록(감사 추적) */
  async logAccess(
    videoClipId: string,
    user: User,
    action: VideoAccessAction
  ): Promise<VideoAccessLog> {
    const log: VideoAccessLog = {
      id: uid("vlog"),
      videoClipId,
      userId: user.id,
      userName: user.name,
      facilityId: user.facilityId ?? "",
      action,
      accessedAt: new Date().toISOString(),
      // 실제로는 서버에서 채움 — mock 에서는 표시용 더미
      ipAddress: "10.0.0.1",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : "mock",
    };
    db.videoAccessLogs.unshift(log);
    return log;
  },

  async listAccessLogs(videoClipId: string, user: User | null): Promise<VideoAccessLog[]> {
    assertAdmin(user);
    return delay(db.videoAccessLogs.filter((l) => l.videoClipId === videoClipId));
  },
};
