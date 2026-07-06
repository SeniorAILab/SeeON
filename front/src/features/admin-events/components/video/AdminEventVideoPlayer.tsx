import { useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize2, Download, Loader2, AlertCircle } from "lucide-react";
import { formatTime, formatDateTime } from "@/lib/format";
import { EventClipTimeline } from "./EventClipTimeline";
import { VideoAccessNotice } from "./VideoAccessNotice";
import { VideoUnavailableState } from "./VideoUnavailableState";
import { videoService } from "@/features/admin-events/services/videoService";
import { useAuthStore } from "@/stores/authStore";
import type { VideoClip } from "@/types";

// 실제 스토리지가 없는 MVP — 클립을 시뮬레이션 재생(플레이스홀더 + 진행바).
// 실제 연동 시 <video src={signedUrl}> 로 교체하고 timeupdate 이벤트만 연결하면 됨.
function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function AdminEventVideoPlayer({ clip }: { clip: VideoClip }) {
  const user = useAuthStore((s) => s.user);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [signedReady, setSignedReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duration = clip.durationSeconds;
  const detectionSec = duration / 2; // 감지 시점 = 클립 중앙

  // 시뮬레이션 재생 루프
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCur((c) => {
        if (c + 0.2 >= duration) {
          setPlaying(false);
          return duration;
        }
        return c + 0.2;
      });
    }, 200);
    return () => clearInterval(t);
  }, [playing, duration]);

  async function handlePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setError(null);
    // 최초 재생 시 signed URL 발급(+ 접근 로그) — 실제 영상이라면 이 URL 을 video src 로 사용
    if (!signedReady) {
      setLoadingUrl(true);
      try {
        await videoService.getSignedUrl(clip.id, user);
        setSignedReady(true);
      } catch (e) {
        setError((e as Error).message);
        setLoadingUrl(false);
        return;
      }
      setLoadingUrl(false);
    }
    if (cur >= duration) setCur(0);
    setPlaying(true);
  }

  async function handleFullscreen() {
    await videoService.logAccess(clip.id, user!, "FULLSCREEN").catch(() => {});
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }

  async function handleDownloadBlocked() {
    // 다운로드는 기본 비활성화 — 시도 자체를 로그로 남긴다.
    await videoService.logAccess(clip.id, user!, "DOWNLOAD_BLOCKED").catch(() => {});
  }

  if (clip.storageStatus !== "AVAILABLE") {
    return (
      <div className="space-y-2">
        <VideoAccessNotice />
        <VideoUnavailableState status={clip.storageStatus} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <VideoAccessNotice />

      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-border bg-black"
      >
        {/* 영상 표시 영역 (플레이스홀더) */}
        <div className="relative flex aspect-video w-full items-center justify-center bg-gradient-to-br from-[#1b2735] to-[#0b1119]">
          {/* 감지 구간임을 나타내는 은은한 표시 (실제 영상 대체) */}
          <div className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #ffffff10 0 12px, transparent 12px 24px)",
            }}
          />
          <div className="z-10 text-center text-white/80">
            <p className="text-sm font-medium">{clip.cameraId} · 이벤트 구간 클립</p>
            <p className="mt-1 text-xs text-white/50">
              {formatTime(clip.clipStartAt)} ~ {formatTime(clip.clipEndAt)} ({duration}초)
            </p>
            {cur >= Math.floor(detectionSec) && cur <= Math.ceil(detectionSec) && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-status-danger/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                <AlertCircle className="h-3 w-3" /> 감지 시점
              </span>
            )}
          </div>

          {/* 중앙 재생 버튼 */}
          {!playing && (
            <button
              onClick={handlePlay}
              className="absolute z-20 flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg transition hover:scale-105"
              aria-label="재생"
            >
              {loadingUrl ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <Play className="ml-1 h-7 w-7" />
              )}
            </button>
          )}
        </div>

        {/* 컨트롤 바 */}
        <div className="space-y-2 bg-[#11161d] px-3 py-2.5">
          <EventClipTimeline
            currentSec={cur}
            durationSec={duration}
            detectionSec={detectionSec}
            onSeek={(s) => setCur(s)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlay}
              className="rounded-md p-1.5 text-white hover:bg-white/10"
              aria-label={playing ? "일시정지" : "재생"}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <span className="text-xs tabular-nums text-white/70">
              {mmss(cur)} / {mmss(duration)}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={handleFullscreen}
                className="rounded-md p-1.5 text-white hover:bg-white/10"
                aria-label="전체화면"
                title="전체화면"
              >
                <Maximize2 className="h-5 w-5" />
              </button>
              <button
                onClick={handleDownloadBlocked}
                disabled
                className="flex cursor-not-allowed items-center gap-1 rounded-md p-1.5 text-white/30"
                title="다운로드는 비활성화되어 있습니다"
              >
                <Download className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p>
      )}
      <p className="text-[11px] text-ink-faint">
        보관 만료: {formatDateTime(clip.expiresAt)} 이후 자동 삭제 · 다운로드/외부 공유 비활성화
      </p>
    </div>
  );
}
