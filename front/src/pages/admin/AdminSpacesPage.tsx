import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Field, Input, Select } from "@/components/ui/primitives";
import { createFloor, deleteFloor, listFloors, updateFloor } from "@/services/api/floors";
import { createSpace, deleteSpace, listSpaces, updateSpace } from "@/services/api/spaces";
import { apiErrorMessage } from "@/services/apiClient";
import type { Floor, Space } from "@/types";

type SpaceDraft = Pick<Space, "floorId" | "name" | "isActive"> & { id?: string };

function emptySpaceDraft(floorId: string): SpaceDraft {
  return {
    floorId,
    name: "",
    isActive: true,
  };
}

export function AdminSpacesPage() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [newFloorName, setNewFloorName] = useState("");
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [editingFloorName, setEditingFloorName] = useState("");
  const [spaceDraft, setSpaceDraft] = useState<SpaceDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [nextFloors, nextSpaces] = await Promise.all([listFloors(), listSpaces()]);
    setFloors(nextFloors);
    setSpaces(nextSpaces);
  }

  useEffect(() => {
    load();
  }, []);

  const floorName = useMemo(
    () => (id: string) => floors.find((floor) => floor.id === id)?.name ?? "—",
    [floors]
  );

  async function addFloor() {
    const name = newFloorName.trim();
    if (!name) return;
    setError(null);
    setNotice(null);
    try {
      await createFloor({ name });
      setNewFloorName("");
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, "층을 추가할 수 없습니다. 다시 시도하세요."));
    }
  }

  async function saveFloor(id: string) {
    const name = editingFloorName.trim();
    if (!name) return;
    setError(null);
    setNotice(null);
    try {
      await updateFloor(id, { name });
      setEditingFloorId(null);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, "층 이름을 저장할 수 없습니다. 다시 시도하세요."));
    }
  }

  async function removeFloor(id: string) {
    setError(null);
    setNotice(null);
    try {
      await deleteFloor(id);
      await load();
      setNotice("층을 삭제했습니다.");
    } catch (e) {
      setError(
        apiErrorMessage(
          e,
          "층을 삭제할 수 없습니다. 다시 시도하세요."
        )
      );
    }
  }

  async function saveSpace() {
    if (!spaceDraft || !spaceDraft.name.trim() || !spaceDraft.floorId) return;
    setError(null);
    setNotice(null);
    const input = {
      floorId: spaceDraft.floorId,
      name: spaceDraft.name.trim(),
      isActive: spaceDraft.isActive,
    };
    try {
      if (spaceDraft.id) {
        await updateSpace(spaceDraft.id, input);
      } else {
        await createSpace({ ...input, type: "ROOM", capacity: 1 });
      }
      setSpaceDraft(null);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, "공간을 저장할 수 없습니다. 다시 시도하세요."));
    }
  }

  async function removeSpace(space: Space) {
    setError(null);
    setNotice(null);
    try {
      await deleteSpace(space.id);
      setSpaces((current) =>
        current.map((item) => (item.id === space.id ? { ...item, isActive: false } : item))
      );
      setNotice(`${space.name} 공간을 숨겼습니다.`);
    } catch (e) {
      setError(apiErrorMessage(e, "공간을 숨길 수 없습니다. 다시 시도하세요."));
    }
  }

  async function restoreSpace(space: Space) {
    setError(null);
    setNotice(null);
    try {
      await updateSpace(space.id, { isActive: true });
      setSpaces((current) =>
        current.map((item) => (item.id === space.id ? { ...item, isActive: true } : item))
      );
      setNotice(`${space.name} 공간을 복원했습니다.`);
    } catch (e) {
      setError(apiErrorMessage(e, "공간을 복원할 수 없습니다. 다시 시도하세요."));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="공간 관리"
        description="층과 공간을 한 화면에서 관리합니다. 공간은 대시보드 표시 여부를 조정할 수 있습니다."
        action={
          <Button
            onClick={() => setSpaceDraft(emptySpaceDraft(floors[0]?.id ?? ""))}
            disabled={floors.length === 0}
          >
            <Plus className="h-4 w-4" />
            공간 추가
          </Button>
        }
      />

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="font-semibold text-ink">층 관리</h3>
          <p className="mt-1 text-sm text-ink-soft">공간을 배치할 층을 추가하거나 이름을 수정합니다.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="새 층 이름 (예: 5F)"
            value={newFloorName}
            onChange={(e) => setNewFloorName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFloor()}
          />
          <Button onClick={addFloor} className="shrink-0">
            <Plus className="h-4 w-4" />
            층 추가
          </Button>
        </div>
        {(error || notice) && (
          <p
            className={
              "rounded-lg px-3 py-2 text-sm " +
              (error
                ? "bg-status-dangerBg text-status-danger"
                : "bg-status-stableBg text-status-stable")
            }
          >
            {error ?? notice}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {floors.map((floor) => {
            const edgeOwned = floor.provisioningSource === "EDGE";
            return (
              <div key={floor.id} className="flex min-h-12 items-center gap-2 rounded-xl border border-border p-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-ink-soft">
                  {floor.orderIndex}
                </span>
                {editingFloorId === floor.id ? (
                  <>
                    <Input
                      className="h-9 flex-1"
                      aria-label={`${floor.name} 층 이름 편집`}
                      value={editingFloorName}
                      onChange={(e) => setEditingFloorName(e.target.value)}
                      autoFocus
                    />
                    <Button size="sm" aria-label="층 이름 저장" onClick={() => saveFloor(floor.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="수정 취소" onClick={() => setEditingFloorId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-medium text-ink">{floor.name}</span>
                    {edgeOwned ? (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink-soft">
                        현장 Edge에서 관리됨
                      </span>
                    ) : (
                      <>
                        <button
                          className="rounded-md p-2 text-gray-400 hover:bg-gray-100"
                          aria-label={`${floor.name} 이름 수정`}
                          onClick={() => {
                            setEditingFloorId(floor.id);
                            setEditingFloorName(floor.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-md p-2 text-status-danger hover:bg-status-dangerBg"
                          aria-label={`${floor.name} 삭제`}
                          onClick={() => removeFloor(floor.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {spaceDraft && (
        <Card className="space-y-4 p-6">
          <h3 className="font-semibold text-ink">{spaceDraft.id ? "공간 수정" : "새 공간 추가"}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="공간명">
              <Input
                value={spaceDraft.name}
                placeholder="예: 204호"
                onChange={(e) => setSpaceDraft({ ...spaceDraft, name: e.target.value })}
              />
            </Field>
            <Field label="층">
              <Select
                value={spaceDraft.floorId}
                onChange={(e) => setSpaceDraft({ ...spaceDraft, floorId: e.target.value })}
              >
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={spaceDraft.isActive}
              onChange={(e) => setSpaceDraft({ ...spaceDraft, isActive: e.target.checked })}
            />
            대시보드 표시
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSpaceDraft(null)}>
              취소
            </Button>
            <Button onClick={saveSpace}>저장</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-gray-50 text-left text-xs text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">공간명</th>
              <th className="px-4 py-3 font-medium">층</th>
              <th className="px-4 py-3 font-medium">대시보드 표시</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {spaces.map((space) => {
              const edgeOwned = space.provisioningSource === "EDGE";
              return (
                <tr key={space.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{space.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{floorName(space.floorId)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded-md px-2 py-0.5 text-xs font-medium " +
                        (space.isActive
                          ? "bg-status-stableBg text-status-stable"
                          : "bg-gray-100 text-gray-400")
                      }
                    >
                      {space.isActive ? "표시" : "숨김"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {edgeOwned ? (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink-soft">
                          현장 Edge에서 관리됨
                        </span>
                      ) : (
                        <>
                          <button
                            className="rounded-md p-2 text-gray-400 hover:bg-gray-100"
                            aria-label={`${space.name} 수정`}
                            onClick={() =>
                              setSpaceDraft({
                                id: space.id,
                                floorId: space.floorId,
                                name: space.name,
                                isActive: space.isActive,
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {space.isActive ? (
                            <button
                              className="rounded-md p-2 text-status-danger hover:bg-status-dangerBg"
                              aria-label={`${space.name} 숨김`}
                              onClick={() => removeSpace(space)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <Button size="sm" aria-label={`${space.name} 복원`} onClick={() => restoreSpace(space)}>
                              복원
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
