import { ShieldCheck } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { buildAlertMediaContentPath, type ReadyAlertMediaClip } from "@/services/api/alertMedia";

type AlertEvidencePlayerProps = {
  readonly alertId: string;
  readonly clip: ReadyAlertMediaClip;
  readonly setVideoElement: (video: HTMLVideoElement | null) => void;
  readonly onPlay: () => void;
  readonly onPlaybackError: () => void;
};

export function AlertEvidencePlayer({
  alertId,
  clip,
  setVideoElement,
  onPlay,
  onPlaybackError,
}: AlertEvidencePlayerProps) {
  const descriptionId = `alert-evidence-description-${encodeURIComponent(alertId)}`;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-ink">
        <video
          ref={setVideoElement}
          aria-label="낙상 감지 근거 영상"
          aria-describedby={descriptionId}
          className="aspect-video w-full bg-ink object-contain"
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          height={720}
          playsInline
          preload="metadata"
          src={buildAlertMediaContentPath(alertId)}
          width={1280}
          onError={onPlaybackError}
          onPlay={onPlay}
        >
          브라우저가 MP4 영상 재생을 지원하지 않습니다.
        </video>
      </div>

      <dl className="grid gap-2 rounded-lg bg-surface2 p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-medium text-ink-faint">클립 시작</dt>
          <dd className="mt-1 break-keep font-semibold tabular-nums text-ink">
            {formatDateTime(clip.clipStartAt)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-faint">감지 시각</dt>
          <dd className="mt-1 break-keep font-semibold tabular-nums text-ink">
            {formatDateTime(clip.detectedAt)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-faint">재생 구간</dt>
          <dd className="mt-1 font-semibold tabular-nums text-ink">
            {clip.durationSeconds}초
          </dd>
        </div>
      </dl>

      <p
        id={descriptionId}
        className="flex items-start gap-2 text-sm leading-relaxed text-ink-faint break-keep"
      >
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
        <span>
          근거 영상은 최소 60일 보관 대상으로 관리됩니다. 법적 보존 조치가 있으면
          보관 기간이 연장될 수 있으며, 다운로드와 외부 공유는 제공하지 않습니다.
        </span>
      </p>
    </div>
  );
}
