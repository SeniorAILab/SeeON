import { cn } from "@/lib/utils";

/**
 * Senior AI Lab 브랜드 마크 (SVG 재현본)
 * - SA 모노그램 + 회로 노드(AI) + teal→navy 그라데이션
 * - 업로드하신 PNG 로 교체하려면 이 SVG 를 그대로 두고
 *   public/logo.svg 를 덮어쓰거나 이 컴포넌트만 <img>로 바꾸면 됩니다.
 */
export function LogoMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Senior AI Lab"
    >
      <defs>
        <linearGradient id="sa-grad" x1="20" y1="14" x2="78" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2bb6a3" />
          <stop offset="0.5" stopColor="#2f6fb0" />
          <stop offset="1" stopColor="#16325a" />
        </linearGradient>
      </defs>

      {/* S 리본 */}
      <path
        d="M67 25 C59 18 43 18 36 25 C27 34 32 45 46 49 C60 53 65 61 59 69 C52 78 37 78 29 71"
        stroke="url(#sa-grad)"
        strokeWidth="11"
        strokeLinecap="round"
      />

      {/* A 모노그램 */}
      <path
        d="M64 84 L79 33 L94 84 M69 70 H89"
        stroke="#16325a"
        strokeWidth="9.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="dark:stroke-[#5fa3f7]"
      />

      {/* 회로 노드 (AI) */}
      <g stroke="#2f6fb0" strokeWidth="2.4" strokeLinecap="round" className="dark:stroke-[#4d97e0]">
        <path d="M55 47 L62 40 L62 28" />
        <path d="M62 40 L72 34 L72 24" />
        <path d="M62 40 L74 44 L82 40" />
        <path d="M55 47 L52 38" />
      </g>
      <g fill="#2bb6a3" className="dark:fill-[#3fd3bd]">
        <circle cx="62" cy="26" r="3.4" />
        <circle cx="72" cy="22" r="3.4" />
      </g>
      <g fill="#2f6fb0" className="dark:fill-[#4d97e0]">
        <circle cx="52" cy="36" r="3.4" />
        <circle cx="83" cy="40" r="3.4" />
      </g>
    </svg>
  );
}

export function LogoWordmark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <div className="leading-tight">
        <div className="font-bold text-ink" style={{ fontSize: size * 0.42 }}>
          Senior AI Lab
        </div>
        <div className="text-ink-faint" style={{ fontSize: size * 0.3 }}>
          안전 확인 시스템
        </div>
      </div>
    </div>
  );
}
