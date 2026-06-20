import { useEffect, useState } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2, Check, X, Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Input } from "@/components/ui/primitives";
import { adminService } from "@/services/adminService";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import type { Floor } from "@/types";

export function AdminFloorsPage() {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? "fac_happy_nokyang";

  const [floors, setFloors] = useState<Floor[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => adminService.listFloors(facilityId).then(setFloors);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  async function add() {
    if (!newName.trim()) return;
    await adminService.createFloor(facilityId, newName.trim());
    setNewName("");
    load();
  }
  async function saveEdit(id: string) {
    await adminService.updateFloor(id, { name: editName.trim() });
    setEditing(null);
    load();
  }
  async function remove(id: string) {
    setError(null);
    try {
      await adminService.deleteFloor(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function move(id: string, dir: "up" | "down") {
    await adminService.reorderFloor(id, dir);
    load();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="층 관리" description="층을 추가하고 순서를 변경할 수 있습니다." />

      <Card className="flex gap-2 p-4">
        <Input
          placeholder="새 층 이름 (예: 5F)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} className="shrink-0">
          <Plus className="h-4 w-4" />
          추가
        </Button>
      </Card>

      {error && (
        <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {floors.map((f, i) => (
          <Card key={f.id} className="flex items-center gap-3 p-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-ink-soft">
              {f.orderIndex}
            </span>
            {editing === f.id ? (
              <>
                <Input
                  className="h-8 flex-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <Button size="sm" onClick={() => saveEdit(f.id)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium text-ink">{f.name}</span>
                <button
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(f.id, "up")}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  disabled={i === floors.length - 1}
                  onClick={() => move(f.id, "down")}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100"
                  onClick={() => {
                    setEditing(f.id);
                    setEditName(f.name);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  className="rounded-md p-1.5 text-status-danger hover:bg-status-dangerBg"
                  onClick={() => remove(f.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
