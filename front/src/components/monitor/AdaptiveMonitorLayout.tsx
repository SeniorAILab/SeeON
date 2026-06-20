import { useMemo } from "react";
import { CompactSpaceCard } from "./CompactSpaceCard";
import { ExpandedAlertCard } from "./ExpandedAlertCard";
import { EmergencyOverlay } from "./EmergencyOverlay";
import type { Floor, Space, SpaceStatus } from "@/types";

type LayoutMode = "NORMAL" | "ATTENTION" | "DANGER" | "EMERGENCY";

/**
 * 적응형 레이아웃:
 *  - 평상시(NORMAL): 14개 공간을 작고 조용한 압축형으로
 *  - 주의(ATTENTION): 주의 공간만 1.5배 확대, 나머지 압축
 *  - 위험(DANGER): 위험 공간을 대형 강조, 나머지 압축
 *  - 응급(EMERGENCY): 중앙 대형 오버레이 + 배경 딤
 * 위험/응급은 확인 완료 전까지 유지된다.
 */
export function AdaptiveMonitorLayout({
  spaces,
  statuses,
  floorOf,
  onSelect,
  onAck,
}: {
  spaces: Space[];
  statuses: Record<string, SpaceStatus>;
  floorOf: (floorId: string) => Floor | undefined;
  onSelect: (space: Space) => void;
  onAck: (spaceId: string) => void;
}) {
  const { emergencies, dangers, cautions, mode } = useMemo(() => {
    const st = (s: Space) => statuses[s.id];
    const emergencies = spaces.filter((s) => st(s)?.emergency);
    const dangers = spaces.filter((s) => st(s)?.status === "DANGER" && !st(s)?.emergency);
    const cautions = spaces.filter(
      (s) => st(s)?.status === "CAUTION" || st(s)?.status === "CHECK_NEEDED"
    );
    const mode: LayoutMode =
      emergencies.length > 0
        ? "EMERGENCY"
        : dangers.length > 0
        ? "DANGER"
        : cautions.length > 0
        ? "ATTENTION"
        : "NORMAL";
    return { emergencies, dangers, cautions, mode };
  }, [spaces, statuses]);

  const focusIds = new Set<string>();
  if (mode === "ATTENTION") cautions.forEach((s) => focusIds.add(s.id));
  if (mode === "DANGER") dangers.forEach((s) => focusIds.add(s.id));

  const compactSpaces = spaces.filter((s) => !focusIds.has(s.id));
  const compactCols = "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6";
  const dim = mode === "EMERGENCY";

  return (
    <div className="space-y-4">
      {/* 주의 확대 영역 */}
      {mode === "ATTENTION" && (
        <div className={`grid gap-4 ${cautions.length > 1 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          {cautions.slice(0, 4).map((s) => (
            <ExpandedAlertCard
              key={s.id}
              space={s}
              floor={floorOf(s.floorId)}
              status={statuses[s.id]}
              emphasis="caution"
              onAck={() => onAck(s.id)}
              onDetail={() => onSelect(s)}
            />
          ))}
        </div>
      )}

      {/* 위험 대형 강조 영역 */}
      {mode === "DANGER" && (
        <div className={`grid gap-4 ${dangers.length > 1 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          {dangers.map((s) => (
            <ExpandedAlertCard
              key={s.id}
              space={s}
              floor={floorOf(s.floorId)}
              status={statuses[s.id]}
              emphasis="danger"
              onAck={() => onAck(s.id)}
              onDetail={() => onSelect(s)}
            />
          ))}
        </div>
      )}

      {/* 압축형 그리드 (응급 시 딤) */}
      <div className={`grid gap-2.5 ${compactCols}`}>
        {compactSpaces.map((s) => (
          <CompactSpaceCard
            key={s.id}
            space={s}
            status={statuses[s.id]}
            dimmed={dim}
            onClick={() => onSelect(s)}
          />
        ))}
      </div>

      {/* 응급 중앙 오버레이 */}
      {mode === "EMERGENCY" && emergencies[0] && (
        <EmergencyOverlay
          space={emergencies[0]}
          floor={floorOf(emergencies[0].floorId)}
          status={statuses[emergencies[0].id]}
          others={emergencies.length - 1 + dangers.length + cautions.length}
          onAck={() => onAck(emergencies[0].id)}
          onDetail={() => onSelect(emergencies[0])}
        />
      )}
    </div>
  );
}
