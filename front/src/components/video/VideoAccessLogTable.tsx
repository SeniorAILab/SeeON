import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { videoService } from "@/services/videoService";
import { useAuthStore } from "@/store/authStore";
import type { VideoAccessAction, VideoAccessLog } from "@/types";

const actionLabel: Record<VideoAccessAction, string> = {
  VIEW: "상세 열람",
  PLAY: "재생",
  FULLSCREEN: "전체화면",
  DOWNLOAD_BLOCKED: "다운로드 시도(차단)",
};

/** 영상 접근 감사 로그 — 누가 언제 무엇을 했는지 기록 */
export function VideoAccessLogTable({ videoClipId, refreshKey }: { videoClipId: string; refreshKey?: number }) {
  const user = useAuthStore((s) => s.user);
  const [logs, setLogs] = useState<VideoAccessLog[]>([]);

  useEffect(() => {
    videoService.listAccessLogs(videoClipId, user).then(setLogs).catch(() => setLogs([]));
  }, [videoClipId, user, refreshKey]);

  if (logs.length === 0) {
    return <p className="text-sm text-ink-faint">아직 영상 접근 기록이 없습니다.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface2 text-left text-xs text-ink-faint">
          <tr>
            <th className="px-3 py-2 font-medium">사용자</th>
            <th className="px-3 py-2 font-medium">동작</th>
            <th className="px-3 py-2 font-medium">시각</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-ink">{l.userName}</td>
              <td className="px-3 py-2 text-ink-soft">{actionLabel[l.action]}</td>
              <td className="px-3 py-2 text-ink-soft">{formatDateTime(l.accessedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
