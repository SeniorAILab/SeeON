import { VideoOff, Clock } from "lucide-react";
import type { VideoStorageStatus } from "@/types";

/** 클립이 없거나 아직 생성 중/만료된 경우 */
export function VideoUnavailableState({ status }: { status?: VideoStorageStatus }) {
  const map: Record<VideoStorageStatus | "NONE", { Icon: typeof VideoOff; text: string }> = {
    NONE: { Icon: VideoOff, text: "해당 이벤트에 연결된 영상 클립이 아직 생성되지 않았습니다." },
    PROCESSING: { Icon: Clock, text: "영상 클립을 생성하는 중입니다. 잠시 후 다시 확인해주세요." },
    AVAILABLE: { Icon: VideoOff, text: "영상을 불러올 수 없습니다." },
    EXPIRED: { Icon: VideoOff, text: "보관 기간이 지나 영상이 자동 삭제되었습니다." },
    DELETED: { Icon: VideoOff, text: "삭제된 영상입니다." },
  };
  const { Icon, text } = map[status ?? "NONE"];
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface2 text-center">
      <Icon className="mb-3 h-10 w-10 text-ink-faint" />
      <p className="px-6 text-sm text-ink-soft">{text}</p>
    </div>
  );
}
