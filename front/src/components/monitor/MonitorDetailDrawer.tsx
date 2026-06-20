import { SpaceDetailPanel } from "@/components/SpaceDetailPanel";
import { useMonitorStore } from "@/stores/monitorStore";
import type { Floor, Space, SpaceStatus } from "@/types";

/**
 * 모니터 모드 상세 — 오른쪽 슬라이드 패널.
 * 권한별 화면(직원: 영상 없음 / 관리자: 영상·타임라인·접근로그)은
 * 기존 SpaceDetailPanel 이 그대로 처리한다.
 * 확인 처리 시 실시간 엔진의 위험 상태도 함께 해제한다.
 */
export function MonitorDetailDrawer({
  space,
  floor,
  status,
  onClose,
}: {
  space: Space;
  floor?: Floor;
  status?: SpaceStatus;
  onClose: () => void;
}) {
  const acknowledge = useMonitorStore((s) => s.acknowledge);
  return (
    <SpaceDetailPanel
      space={space}
      floor={floor}
      status={status}
      onClose={onClose}
      onChanged={() => acknowledge(space.id)}
    />
  );
}
