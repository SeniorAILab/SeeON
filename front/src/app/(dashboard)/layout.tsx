import Link from "next/link";
import type { ReactNode } from "react";

const NAV_LINKS = [
  { href: "/dashboard", label: "NOC" },
  { href: "/alerts", label: "알림 이력" },
  { href: "/admin/residents", label: "대상자" },
  { href: "/admin/cameras", label: "카메라" },
  { href: "/admin/guardians", label: "보호자" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <nav className="border-b border-white/5 bg-slate-900/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <span className="text-sm font-bold tracking-widest text-cyan-400">
            ElderCare NOC
          </span>
          <div className="flex gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-slate-400 transition hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <Link
            href="/auth/logout"
            className="ml-auto text-xs text-slate-500 hover:text-white"
          >
            로그아웃
          </Link>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}
