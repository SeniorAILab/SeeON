"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IS_DEMO } from "../lib/config";
import { ORG } from "../lib/mock/fixtures";
import { useDemoRole } from "../lib/useDemoRole";
import type { DemoRole } from "../lib/mock/types";

// TailAdmin-style fixed sidebar. Role-driven visibility (one shell, no per-role URLs).
type NavItem = { href: string; label: string; icon: keyof typeof ICONS; roles: DemoRole[] };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: "home", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/monitoring", label: "실시간 모니터링", icon: "video", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/alerts", label: "낙상 알림", icon: "bell", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/admin/residents", label: "입소자", icon: "users", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/reports", label: "리포트", icon: "chart", roles: ["OWNER", "ADMIN"] },
  { href: "/settings", label: "설정", icon: "cog", roles: ["ADMIN"] },
];

const PROD_NAV: NavItem[] = [
  { href: "/dashboard", label: "NOC", icon: "home", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/alerts", label: "알림 이력", icon: "bell", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/admin/residents", label: "대상자", icon: "users", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/admin/cameras", label: "카메라", icon: "video", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/admin/guardians", label: "보호자", icon: "users", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
];

const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5",
  video: "M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 4v-11z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.5 21a1.5 1.5 0 0 0 3 0",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11",
  chart: "M3 3v18h18M8 17V9m5 8V5m5 12v-6",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.81 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 7.5 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 7.5a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 3.6V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.4 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 9H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 2z",
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Sidebar() {
  const role = useDemoRole();
  const pathname = usePathname();
  const items = (IS_DEMO ? NAV : PROD_NAV).filter((n) => n.roles.includes(role));
  const brand = IS_DEMO ? ORG.name : "ElderCare NOC";

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-3 border-b border-line px-6 py-5">
        <span className="grid size-9 place-items-center rounded-xl bg-brand text-base font-bold text-white">행</span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-ink">{brand}</p>
          {IS_DEMO ? <p className="text-xs text-muted">녹양역 지점</p> : null}
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition " +
                (active
                  ? "bg-brand-weak text-brand-ink"
                  : "text-ink-2 hover:bg-canvas hover:text-ink")
              }
            >
              <Icon d={ICONS[item.icon]} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-6 py-4 text-xs text-muted">
        영상 미저장 · 포즈 데이터만 분석
      </div>
    </aside>
  );
}
