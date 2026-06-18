"use client";

import { ROLE_LABELS, ROLES } from "../lib/mock/session";
import type { DemoRole } from "../lib/mock/types";
import { changeDemoRole, useDemoRole } from "../lib/useDemoRole";

/**
 * Frontend-only role selector. Persists the chosen role and re-renders
 * subscribers (nav, role-based masking) reactively. The backend role model is
 * never touched.
 */
export function RoleSwitcher() {
  const role = useDemoRole();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    changeDemoRole(event.target.value as DemoRole);
  }

  return (
    <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
      <span className="hidden sm:inline">권한</span>
      <select
        value={role}
        onChange={onChange}
        className="rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
