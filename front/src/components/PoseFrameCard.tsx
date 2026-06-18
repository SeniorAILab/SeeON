import Image from "next/image";
import {
  FALL_DERIVED_METRICS,
  FALL_KEYPOINTS,
  LE2I_FRAME_SRC,
  SKELETON_SEGMENTS,
} from "../lib/mock/pose";

// Privacy-safe alert evidence: a camera frame with the extracted pose skeleton
// overlaid. The narrative is "the camera saw this → we keep only the pose".
// No snapshotKey / /api/alerts/*/snapshot dependency (AC-E).
export function PoseFrameCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
      <div className="relative aspect-video w-full bg-slate-950">
        <Image
          src={LE2I_FRAME_SRC}
          alt="감지 시점 카메라 프레임"
          fill
          className="object-cover opacity-90"
          unoptimized
        />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {SKELETON_SEGMENTS.map(([a, b], i) => {
            const pa = FALL_KEYPOINTS[a];
            const pb = FALL_KEYPOINTS[b];
            return (
              <line
                key={i}
                x1={pa.x * 100}
                y1={pa.y * 100}
                x2={pb.x * 100}
                y2={pb.y * 100}
                stroke="#22d3ee"
                strokeWidth={0.8}
                strokeLinecap="round"
                opacity={0.9}
              />
            );
          })}
          {FALL_KEYPOINTS.map((k, i) => (
            <circle key={i} cx={k.x * 100} cy={k.y * 100} r={1.1} fill="#67e8f9" />
          ))}
        </svg>
        <span className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-[11px] font-semibold text-cyan-300">
          포즈 추정 · COCO-17
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 sm:grid-cols-4">
        {FALL_DERIVED_METRICS.map((m) => (
          <div key={m.label}>
            <p className="text-[11px] text-slate-500">{m.label}</p>
            <p className="text-sm font-semibold text-white">{m.value}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-white/5 px-4 py-3 text-xs text-slate-400">
        영상·이미지는 저장하지 않으며, 추출된 포즈(pose) 데이터만 분석·보관합니다.
      </p>
    </div>
  );
}
