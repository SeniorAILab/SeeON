import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import type { User } from "@/types";

export type AppNavItem = {
  readonly to: string;
  readonly label: string;
  readonly Icon: LucideIcon;
};

type AppSidebarProps = {
  readonly mobileOpen: boolean;
  readonly nav: readonly AppNavItem[];
  readonly user: User | null;
  readonly onCloseMobile: () => void;
  readonly onLogout: () => void;
};

export function AppSidebar({
  mobileOpen,
  nav,
  user,
  onCloseMobile,
  onLogout,
}: AppSidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <LogoMark size={32} />
          <div className="leading-tight">
            <div className="text-sm font-bold text-ink">Senior AI Lab</div>
            <div className="text-[11px] text-gray-400">관리자</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-soft text-brand"
                    : "text-ink-soft hover:bg-gray-100"
                )
              }
            >
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-ink-soft">
              {user?.name.slice(0, 1)}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium text-ink">{user?.name}</div>
              <div className="text-[11px] text-gray-400">
                {user ? roleLabel(user.role) : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </aside>
    </>
  );
}
