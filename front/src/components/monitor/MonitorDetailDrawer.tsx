import { StaffConfirmSheet } from "@/components/staff/StaffConfirmSheet";
import { useMonitorStore } from "@/stores/monitorStore";
import type { Floor, Space, SpaceStatus } from "@/types";

/**
 * 모니터 모드 상세 확인 시트.
 * 공간 선택은 확인 시트를 열고, 처리완료는 monitorStore.resolve를 통해
 * 최신 활성 알림을 1-step terminal resolve 처리한다.
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
  const resolve = useMonitorStore((s) => s.resolve);
  return (
    <StaffConfirmSheet
      space={space}
      floor={floor}
      status={status}
      onClose={onClose}
      onResolve={resolve}
      onDone={onClose}
    />
  );
}
