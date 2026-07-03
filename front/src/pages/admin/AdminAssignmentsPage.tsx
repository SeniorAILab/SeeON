// 가역 숨김 상태, 백엔드 컨트롤러 부활 시 재배선.
import { useEffect, useMemo, useState } from "react";
import { BedDouble, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Select } from "@/components/ui/primitives";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { listFloors } from "@/services/api/floors";
import { listSpaces } from "@/services/api/spaces";
import { zoneService, type ZoneWithResident } from "@/services/zoneService";
import { residentService } from "@/services/residentService";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import type { Floor, Resident, Space } from "@/types";

export function AdminAssignmentsPage() {
  const facilityId = useActiveFacilityId();

  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Space[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [floorId, setFloorId] = useState<string>("");

  async function loadBase() {
    const [fl, sp, rs] = await Promise.all([
      listFloors(),
      listSpaces(),
      residentService.listResidents(facilityId),
    ]);
    setFloors(fl);
    setRooms(sp.filter((s) => s.type === "ROOM"));
    setResidents(rs);
    if (!floorId) setFloorId(fl.find((f) => f.name === "2F")?.id ?? fl[0]?.id ?? "");
  }
  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  const floorRooms = useMemo(
    () => rooms.filter((r) => r.floorId === floorId),
    [rooms, floorId]
  );

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="구역 / 침대 배정"
        description="호실의 침대(구역)에 어르신을 배정합니다. 개인 정보는 시설에서만 관리됩니다."
      />
      <PrivacyNotice className="justify-start" />

      <div className="flex flex-wrap gap-2">
        {floors
          .filter((f) => rooms.some((r) => r.floorId === f.id))
          .map((f) => (
            <button
              key={f.id}
              onClick={() => setFloorId(f.id)}
              className={
                "h-9 rounded-lg px-4 text-sm font-bold " +
                (floorId === f.id
                  ? "bg-ink text-surface"
                  : "border border-border text-ink-soft hover:bg-surface2")
              }
            >
              {f.name}
            </button>
          ))}
      </div>

      <div className="space-y-3">
        {floorRooms.map((room) => (
          <RoomAssignmentCard key={room.id} room={room} residents={residents} />
        ))}
      </div>
    </div>
  );
}

function RoomAssignmentCard({ room, residents }: { room: Space; residents: Resident[] }) {
  const [zones, setZones] = useState<ZoneWithResident[]>([]);

  const load = () => zoneService.listZonesWithResidents(room.id).then(setZones);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  // 이미 (다른 곳에) 배정된 어르신은 후보에서 제외하지 않되, 표시만
  async function setResident(zoneId: string, residentId: string) {
    if (residentId === "") await zoneService.unassignZone(zoneId);
    else await zoneService.assignResident(residentId, room.id, zoneId);
    load();
  }
  async function addBed() {
    const next = String.fromCharCode(65 + zones.length); // A,B,C...
    await zoneService.createZone(room.id, `침대${next}`, "BED");
    load();
  }
  async function removeBed(zoneId: string) {
    await zoneService.deleteZone(zoneId);
    load();
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-ink">{room.name}</h3>
        <Button size="sm" variant="ghost" onClick={addBed}>
          <Plus className="h-4 w-4" />
          침대 추가
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {zones.map((z) => (
          <div key={z.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
            <BedDouble className="h-5 w-5 shrink-0 text-ink-faint" />
            <span className="w-14 shrink-0 text-sm font-semibold text-ink">{z.name}</span>
            <Select
              className="h-9 flex-1"
              value={z.resident?.id ?? ""}
              onChange={(e) => setResident(z.id, e.target.value)}
            >
              <option value="">— 미배정 —</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.age}세)
                </option>
              ))}
            </Select>
            <button
              onClick={() => removeBed(z.id)}
              className="rounded-md p-1.5 text-ink-faint hover:bg-surface2"
              title="침대 삭제"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
