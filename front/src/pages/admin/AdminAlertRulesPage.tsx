import { useEffect, useState } from "react";
import { Plus, Trash2, Bell } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Field, Input, Select } from "@/components/ui/primitives";
import { adminService } from "@/services/adminService";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import { levelLabel } from "@/lib/labels";
import type { AlertRule, Level, Space } from "@/types";

const LEVELS: Level[] = ["LOW", "MEDIUM", "HIGH"];

export function AdminAlertRulesPage() {
  const facilityId = useActiveFacilityId();

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);

  async function load() {
    const [r, s] = await Promise.all([
      adminService.listAlertRules(facilityId),
      adminService.listSpaces(facilityId),
    ]);
    setRules(r);
    setSpaces(s);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  async function addRule() {
    await adminService.createAlertRule({
      facilityId,
      spaceId: null,
      minRiskLevel: "MEDIUM",
      kakaoEnabled: true,
      recipients: [],
      dayModeEnabled: true,
      nightModeEnabled: true,
      sensitivity: "MEDIUM",
    });
    load();
  }
  async function patch(id: string, p: Partial<AlertRule>) {
    await adminService.updateAlertRule(id, p);
    load();
  }
  async function remove(id: string) {
    await adminService.deleteAlertRule(id);
    load();
  }

  const spaceName = (id: string | null) =>
    id ? spaces.find((s) => s.id === id)?.name ?? id : "시설 전체 (기본)";

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="알림 규칙"
        description="위험도 기준과 카카오톡 알림 발송 조건을 설정합니다."
        action={
          <Button onClick={addRule}>
            <Plus className="h-4 w-4" />
            규칙 추가
          </Button>
        }
      />

      <div className="space-y-3">
        {rules.map((r) => (
          <Card key={r.id} className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand" />
                <h3 className="font-semibold text-ink">{spaceName(r.spaceId)}</h3>
              </div>
              <button
                className="rounded-md p-1.5 text-status-danger hover:bg-status-dangerBg"
                onClick={() => remove(r.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="적용 공간">
                <Select
                  value={r.spaceId ?? "ALL"}
                  onChange={(e) =>
                    patch(r.id, { spaceId: e.target.value === "ALL" ? null : e.target.value })
                  }
                >
                  <option value="ALL">시설 전체 (기본 규칙)</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="알림 발송 기준 (이 위험도 이상)">
                <Select
                  value={r.minRiskLevel}
                  onChange={(e) => patch(r.id, { minRiskLevel: e.target.value as Level })}
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {levelLabel[l]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="알림 민감도">
                <Select
                  value={r.sensitivity}
                  onChange={(e) => patch(r.id, { sensitivity: e.target.value as Level })}
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {levelLabel[l]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="수신 대상" hint="쉼표로 구분 (이름/연락처)">
                <Input
                  value={r.recipients.join(", ")}
                  placeholder="이간호 (010-...), 김원장 (010-...)"
                  onChange={(e) =>
                    patch(r.id, {
                      recipients: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle
                label="카카오톡 알림"
                checked={r.kakaoEnabled}
                onChange={(v) => patch(r.id, { kakaoEnabled: v })}
              />
              <Toggle
                label="주간 알림"
                checked={r.dayModeEnabled}
                onChange={(v) => patch(r.id, { dayModeEnabled: v })}
              />
              <Toggle
                label="야간 알림"
                checked={r.nightModeEnabled}
                onChange={(v) => patch(r.id, { nightModeEnabled: v })}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
