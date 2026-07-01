import { useEffect, useMemo, useState } from "react";
import { Filter, RefreshCw, AlertTriangle } from "lucide-react";
import { StatsBar } from "@/components/StatsBar";
import { FloorTabs } from "@/components/FloorTabs";
import { StatusCard } from "@/components/StatusCard";
import { SpaceDetailPanel } from "@/components/SpaceDetailPanel";
import { Select } from "@/components/ui/primitives";
import { dashboardService } from "@/services/dashboardService";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import { spaceTypeLabel } from "@/lib/labels";
import type { DashboardResponse, Space, SpaceType } from "@/types";

const SPACE_TYPES: SpaceType[] = [
  "ROOM",
  "HALLWAY",
  "PROGRAM_ROOM",
  "REHAB_ROOM",
  "LOBBY",
  "OFFICE",
  "ETC",
];

export function DashboardPage() {
  const facilityId = useActiveFacilityId();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [floorFilter, setFloorFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<Space | null>(null);

  async function load() {
    if (!facilityId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await dashboardService.getDashboard(facilityId);
    setData(res);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // 실시간 반영 시뮬레이션: 20초마다 폴링 (실제는 WebSocket/SSE 권장)
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  const visibleSpaces = useMemo(() => {
    if (!data) return [];
    return data.spaces
      .filter((s) => s.isActive)
      .filter((s) => floorFilter === "ALL" || s.floorId === floorFilter)
      .filter((s) => typeFilter === "ALL" || s.type === typeFilter)
      .filter((s) => {
        if (statusFilter === "ALL") return true;
        return data.statuses[s.id]?.status === statusFilter;
      })
      .sort((a, b) => {
        // 위험 우선 정렬 — 직원이 3초 안에 위험 공간을 인지하도록
        const rank = { DANGER: 0, CAUTION: 1, CHECK_NEEDED: 2, STABLE: 3 };
        const ra = rank[data.statuses[a.id]?.status ?? "STABLE"];
        const rb = rank[data.statuses[b.id]?.status ?? "STABLE"];
        return ra - rb;
      });
  }, [data, floorFilter, statusFilter, typeFilter]);

  if (loading && !data) {
    return <div className="py-20 text-center text-sm text-gray-400">대시보드를 불러오는 중...</div>;
  }
  if (!data) return null;

  const floorOf = (id: string) => data.floors.find((f) => f.id === id);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{data.facility.name}</h1>
          <p className="mt-0.5 text-sm text-gray-400">{data.facility.address}</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-ink-soft hover:bg-gray-50"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          새로고침
        </button>
      </div>

      {/* 위험 알림 배너 */}
      {data.summary.danger > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-status-danger/30 bg-status-dangerBg px-4 py-3 text-sm text-status-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            위험 상태 {data.summary.danger}건이 감지되었습니다. 즉시 확인이 필요합니다.
          </span>
        </div>
      )}

      {/* 요약 통계 */}
      <StatsBar summary={data.summary} activeFilter={statusFilter} onFilter={setStatusFilter} />

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <FloorTabs floors={data.floors} value={floorFilter} onChange={setFloorFilter} />
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <Select
            className="h-8 w-auto"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">모든 유형</option>
            {SPACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {spaceTypeLabel[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* 카드 그리드 */}
      {visibleSpaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-gray-400">
          조건에 맞는 공간이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleSpaces.map((space) => (
            <StatusCard
              key={space.id}
              space={space}
              floor={floorOf(space.floorId)}
              status={data.statuses[space.id]}
              onClick={() => setSelected(space)}
            />
          ))}
        </div>
      )}

      {/* 상세 패널 */}
      {selected && (
        <SpaceDetailPanel
          space={selected}
          floor={floorOf(selected.floorId)}
          status={data.statuses[selected.id]}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
