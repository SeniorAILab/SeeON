import { useEffect, useState } from "react";
import {
  Building2,
  ChevronDown,
  LayoutGrid,
  Menu,
  MonitorPlay,
  Smartphone,
  X,
} from "lucide-react";
import type { FacilitySelectorItem } from "@/services/api/dashboardEndpoints";
import type { User } from "@/types";

type AppHeaderProps = {
  readonly activeFacilityId: string;
  readonly currentFacility: FacilitySelectorItem | null;
  readonly facilitySelectorError: string | null;
  readonly mobileOpen: boolean;
  readonly myFacilities: readonly FacilitySelectorItem[];
  readonly userRole: User["role"] | undefined;
  readonly workspaceFacilityId: string;
  readonly onOpenDashboardHome: () => void;
  readonly onOpenMonitor: () => void;
  readonly onOpenStaffMode: () => void;
  readonly onSelectWorkspaceFacility: (optionValue: string) => void;
  readonly onToggleMobile: () => void;
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function AppHeader({
  activeFacilityId,
  currentFacility,
  facilitySelectorError,
  mobileOpen,
  myFacilities,
  userRole,
  workspaceFacilityId,
  onOpenDashboardHome,
  onOpenMonitor,
  onOpenStaffMode,
  onSelectWorkspaceFacility,
  onToggleMobile,
}: AppHeaderProps) {
  const now = useClock();

  return (
    <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-2 border-b border-border bg-surface/80 px-4 py-2 backdrop-blur lg:flex-nowrap lg:gap-3 lg:px-6">
      <button
        className="rounded-lg p-1.5 text-ink-soft hover:bg-gray-100 lg:hidden"
        onClick={onToggleMobile}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div className="relative min-w-0 flex-1 lg:flex-none">
        {myFacilities.length > 1 ? (
          <>
            <div className="flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-1.5">
              <Building2 className="h-4 w-4 text-gray-400" />
              <select
                className="min-w-0 max-w-full truncate bg-transparent text-sm font-semibold text-ink focus:outline-none"
                value={
                  userRole === "SUPER_ADMIN"
                    ? currentFacility?.selectionToken ?? ""
                    : currentFacility?.id ?? ""
                }
                onChange={(event) => onSelectWorkspaceFacility(event.target.value)}
              >
                {myFacilities.map((facility) => (
                  <option
                    key={facility.selectionToken ?? facility.id}
                    value={
                      userRole === "SUPER_ADMIN"
                        ? facility.selectionToken ?? ""
                        : facility.id
                    }
                  >
                    {facility.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </div>
            {facilitySelectorError && (
              <div className="mt-1 text-xs font-medium text-status-danger">
                {facilitySelectorError}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Building2 className="h-4 w-4 text-gray-400" />
              {currentFacility?.name ?? workspaceFacilityId}
            </div>
            {facilitySelectorError && (
              <div className="mt-1 text-xs font-medium text-status-danger">
                {facilitySelectorError}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto lg:flex-nowrap lg:gap-3">
        {userRole === "SUPER_ADMIN" && (
          <button
            onClick={onOpenDashboardHome}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-gray-50"
          >
            <LayoutGrid className="h-4 w-4" />
            전체 대시보드
          </button>
        )}
        {activeFacilityId && (
          <button
            onClick={onOpenMonitor}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-gray-50"
          >
            <MonitorPlay className="h-4 w-4" />
            모니터
          </button>
        )}
        <button
          onClick={onOpenStaffMode}
          disabled={!activeFacilityId}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-gray-50"
        >
          <Smartphone className="h-4 w-4" />
          직원 모드
        </button>
        <div className="hidden text-sm tabular-nums text-ink-soft sm:block">
          {now.getFullYear()}.{String(now.getMonth() + 1).padStart(2, "0")}.
          {String(now.getDate()).padStart(2, "0")}{" "}
          {String(now.getHours()).padStart(2, "0")}:
          {String(now.getMinutes()).padStart(2, "0")}
        </div>
      </div>
    </header>
  );
}
