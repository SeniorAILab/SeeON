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
    <label className="flex items-center gap-2 text-xs text-ink-2">
      <span className="hidden sm:inline">권한</span>
      <select
        value={role}
        onChange={onChange}
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-weak"
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
