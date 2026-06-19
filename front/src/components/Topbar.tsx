"use client";

import { IS_DEMO } from "../lib/config";
import { RoleSwitcher } from "./RoleSwitcher";
import Link from "next/link";

// Sticky warm topbar: decorative search (demo) + role switcher + alert bell.
export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-surface/90 px-5 backdrop-blur-sm sm:px-8">
      <label className="relative hidden flex-1 items-center sm:flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="입소자·호실·알림 검색"
          className="w-full max-w-sm rounded-xl border border-line bg-canvas py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-weak"
        />
      </label>
      <div className="ml-auto flex items-center gap-2">
        {IS_DEMO ? (
          <RoleSwitcher />
        ) : (
          <Link href="/auth/logout" className="text-xs text-muted hover:text-ink">
            로그아웃
          </Link>
        )}
        <Link
          href="/alerts"
          aria-label="알림"
          className="relative grid size-9 place-items-center rounded-xl border border-line text-ink-2 transition hover:bg-canvas hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.5 21a1.5 1.5 0 0 0 3 0" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-danger ring-2 ring-surface" />
        </Link>
      </div>
    </header>
  );
}
