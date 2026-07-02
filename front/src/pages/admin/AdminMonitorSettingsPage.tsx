import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Field, Select } from "@/components/ui/primitives";
import { adminService } from "@/services/adminService";
import { useMonitorSettingsStore } from "@/stores/monitorSettingsStore";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import { monitorHomePath } from "@/lib/routeAccess";
import type { Floor, MonitorSettings, Space } from "@/types";

export function AdminMonitorSettingsPage() {
  const navigate = useNavigate();
  const facilityId = useActiveFacilityId();

  const settings = useMonitorSettingsStore();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);

  useEffect(() => {
    adminService.listFloors(facilityId).then(setFloors);
    adminService.listSpaces(facilityId).then(setSpaces);
  }, [facilityId]);

  function toggleSpace(id: string) {
    const cur = settings.visibleSpaceIds ?? spaces.map((s) => s.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    settings.update({ visibleSpaceIds: next.length === spaces.length ? null : next });
  }
  const isVisible = (id: string) =>
    settings.visibleSpaceIds === null || settings.visibleSpaceIds.includes(id);

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="모니터 표시 설정"
        description="요양원 대형 모니터의 전체 층 기본 화면과 층별 표시 방식을 설정합니다."
        action={
          <Button
            variant="secondary"
            disabled={!facilityId}
            onClick={() => navigate(monitorHomePath())}
          >
            <ExternalLink className="h-4 w-4" />
            모니터 열기
          </Button>
        }
      />

      <Card className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="기본 표시 층">
            <Select
              value={settings.defaultFloorId}
              onChange={(e) => settings.update({ defaultFloorId: e.target.value })}
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="all">전체 보기</option>
            </Select>
          </Field>

          <Field label="자동 갱신 간격">
            <Select
              value={String(settings.refreshMs)}
              onChange={(e) => settings.update({ refreshMs: Number(e.target.value) })}
            >
              <option value="5000">5초</option>
              <option value="6000">6초</option>
              <option value="8000">8초</option>
              <option value="10000">10초</option>
            </Select>
          </Field>

          <Field label="데모 모드 (시연용)" hint="실제 운영에서는 자동(AUTO)으로 둡니다.">
            <Select
              value={settings.demoMode}
              onChange={(e) => settings.update({ demoMode: e.target.value as MonitorSettings["demoMode"] })}
            >
              <option value="AUTO">자동 (현재 시각 기준)</option>
              <option value="NORMAL">평상시(휴식)</option>
              <option value="MEAL">식사 시간</option>
              <option value="PROGRAM">프로그램 시간</option>
              <option value="NIGHT">야간</option>
              <option value="RISK_DEMO">위험 이벤트 데모(자주 발생)</option>
            </Select>
          </Field>

          <Field label="카드 표시 크기">
            <Select
              value={settings.cardSize}
              onChange={(e) => settings.update({ cardSize: e.target.value as "lg" | "xl" })}
            >
              <option value="xl">아주 크게 (55인치 TV)</option>
              <option value="lg">크게 (태블릿/데스크톱)</option>
            </Select>
          </Field>
        </div>

        <div className="space-y-2.5 border-t border-border pt-4">
          <Toggle
            label="위험 알림음 사용"
            hint="기본값 꺼짐 · 야간에는 소리 대신 화면 강조가 우선됩니다."
            checked={settings.alertSound}
            onChange={(v) => settings.update({ alertSound: v })}
          />
          <Toggle
            label="야간 모드 (어두운 화면)"
            checked={settings.nightMode}
            onChange={(v) => settings.update({ nightMode: v })}
          />
          <Toggle
            label="전체 층 화면 표시"
            checked={settings.allowAllView}
            onChange={(v) => settings.update({ allowAllView: v })}
          />
        </div>
      </Card>

      {/* 표시할 공간 선택 */}
      <Card className="p-6">
        <div className="mb-3 flex items-center gap-2">
          <Monitor className="h-4 w-4 text-brand" />
          <h3 className="font-semibold text-ink">표시할 공간 선택</h3>
        </div>
        <p className="mb-3 text-xs text-gray-400">
          선택 해제한 공간은 모니터에 표시되지 않습니다. (전체 선택 시 모든 공간 표시)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {spaces.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-soft"
            >
              <input
                type="checkbox"
                checked={isVisible(s.id)}
                onChange={() => toggleSpace(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </Card>

      <p className="text-xs text-gray-400">설정은 이 브라우저(모니터)에 저장됩니다.</p>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
