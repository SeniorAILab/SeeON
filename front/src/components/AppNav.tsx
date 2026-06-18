"use client";

import Link from "next/link";
import { IS_DEMO } from "../lib/config";
import { ORG } from "../lib/mock/fixtures";
import { useDemoRole } from "../lib/useDemoRole";
import type { DemoRole } from "../lib/mock/types";
import { RoleSwitcher } from "./RoleSwitcher";

// Role-based navigation. One /dashboard shell; visibility is driven by role,
// not by separate URL roots (avoids duplicate UI and permission gaps).
const DEMO_NAV: { href: string; label: string; roles: DemoRole[] }[] = [
  { href: "/dashboard", label: "홈", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/monitoring", label: "실시간 모니터링", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/alerts", label: "알림", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/reports", label: "리포트", roles: ["OWNER", "ADMIN"] },
  { href: "/admin/residents", label: "입소자", roles: ["CAREGIVER", "OWNER", "ADMIN"] },
  { href: "/settings", label: "설정", roles: ["ADMIN"] },
];

// Preserves the pre-existing production nav exactly (AC-I).
const PROD_NAV = [
  { href: "/dashboard", label: "NOC" },
  { href: "/alerts", label: "알림 이력" },
  { href: "/admin/residents", label: "대상자" },
  { href: "/admin/cameras", label: "카메라" },
  { href: "/admin/guardians", label: "보호자" },
];

function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-sm text-slate-400 transition hover:text-white"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function AppNav() {
  const role = useDemoRole();

  const brand = IS_DEMO ? ORG.name : "ElderCare NOC";
  const links = IS_DEMO
    ? DEMO_NAV.filter((n) => n.roles.includes(role)).map((n) => ({
        href: n.href,
        label: n.label,
      }))
    : PROD_NAV;

  return (
    <nav className="border-b border-white/5 bg-slate-900/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-bold tracking-widest text-cyan-400">
          {brand}
        </span>
        <NavLinks links={links} />
        {IS_DEMO ? (
          <RoleSwitcher />
        ) : (
          <Link
            href="/auth/logout"
            className="ml-auto text-xs text-slate-500 hover:text-white"
          >
            로그아웃
          </Link>
        )}
      </div>
    </nav>
  );
}
