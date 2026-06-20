import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Field, Input, Select } from "@/components/ui/primitives";
import { adminService } from "@/services/adminService";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import { spaceTypeLabel } from "@/lib/labels";
import type { Floor, Space, SpaceType } from "@/types";

const SPACE_TYPES: SpaceType[] = [
  "ROOM",
  "HALLWAY",
  "PROGRAM_ROOM",
  "REHAB_ROOM",
  "LOBBY",
  "OFFICE",
  "ETC",
];

type Draft = Omit<Space, "id"> & { id?: string };

function emptyDraft(facilityId: string, floorId: string): Draft {
  return {
    facilityId,
    floorId,
    name: "",
    type: "ROOM",
    capacity: 4,
    cameraId: "",
    isActive: true,
    assignedStaff: "",
  };
}

export function AdminSpacesPage() {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? "fac_happy_nokyang";

  const [floors, setFloors] = useState<Floor[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function load() {
    const [fl, sp] = await Promise.all([
      adminService.listFloors(facilityId),
      adminService.listSpaces(facilityId),
    ]);
    setFloors(fl);
    setSpaces(sp);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  const floorName = useMemo(
    () => (id: string) => floors.find((f) => f.id === id)?.name ?? "—",
    [floors]
  );

  async function save() {
    if (!draft || !draft.name.trim()) return;
    if (draft.id) {
      const { id, ...patch } = draft;
      await adminService.updateSpace(id, patch);
    } else {
      const { id: _omit, ...input } = draft;
      await adminService.createSpace(input);
    }
    setDraft(null);
    load();
  }

  async function remove(id: string) {
    await adminService.deleteSpace(id);
    load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="공간 관리"
        description="호실·복도·프로그램실 등 공간과 카메라 연결을 관리합니다."
        action={
          <Button
            onClick={() => setDraft(emptyDraft(facilityId, floors[0]?.id ?? ""))}
            disabled={floors.length === 0}
          >
            <Plus className="h-4 w-4" />
            공간 추가
          </Button>
        }
      />

      {/* 폼 */}
      {draft && (
        <Card className="space-y-4 p-6">
          <h3 className="font-semibold text-ink">{draft.id ? "공간 수정" : "새 공간 추가"}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="공간명">
              <Input
                value={draft.name}
                placeholder="예: 204호"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="층">
              <Select
                value={draft.floorId}
                onChange={(e) => setDraft({ ...draft, floorId: e.target.value })}
              >
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="공간 유형">
              <Select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as SpaceType })}
              >
                {SPACE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {spaceTypeLabel[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="수용 가능 인원">
              <Input
                type="number"
                min={0}
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
              />
            </Field>
            <Field label="카메라 ID" hint="AI 페이로드의 cameraId 와 매칭됩니다.">
              <Input
                value={draft.cameraId}
                placeholder="예: CAM-2F-204"
                onChange={(e) => setDraft({ ...draft, cameraId: e.target.value })}
              />
            </Field>
            <Field label="담당 직원">
              <Input
                value={draft.assignedStaff ?? ""}
                onChange={(e) => setDraft({ ...draft, assignedStaff: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            활성 (대시보드에 표시)
          </label>
          <div className="flex gap-2">
            <Button onClick={save}>저장</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
          </div>
        </Card>
      )}

      {/* 목록 */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-gray-50 text-left text-xs text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">공간명</th>
              <th className="px-4 py-2.5 font-medium">층</th>
              <th className="px-4 py-2.5 font-medium">유형</th>
              <th className="px-4 py-2.5 font-medium">카메라</th>
              <th className="px-4 py-2.5 font-medium">정원</th>
              <th className="px-4 py-2.5 font-medium">상태</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {spaces.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink">{s.name}</td>
                <td className="px-4 py-2.5 text-ink-soft">{floorName(s.floorId)}</td>
                <td className="px-4 py-2.5 text-ink-soft">{spaceTypeLabel[s.type]}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{s.cameraId}</td>
                <td className="px-4 py-2.5 text-ink-soft">{s.capacity}명</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      "rounded-md px-2 py-0.5 text-xs font-medium " +
                      (s.isActive
                        ? "bg-status-stableBg text-status-stable"
                        : "bg-gray-100 text-gray-400")
                    }
                  >
                    {s.isActive ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100"
                      onClick={() => setDraft({ ...s })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-status-danger hover:bg-status-dangerBg"
                      onClick={() => remove(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
