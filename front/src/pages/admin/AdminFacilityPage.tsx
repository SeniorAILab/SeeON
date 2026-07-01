import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Field, Input } from "@/components/ui/primitives";
import { adminService } from "@/services/adminService";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import type { Facility } from "@/types";

export function AdminFacilityPage() {
  const facilityId = useActiveFacilityId();

  const [facility, setFacility] = useState<Facility | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminService.listFacilities().then((list) => {
      setFacility(list.find((f) => f.id === facilityId) ?? null);
    });
  }, [facilityId]);

  if (!facility) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  function set<K extends keyof Facility>(key: K, value: Facility[K]) {
    setFacility((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  async function save() {
    if (!facility) return;
    await adminService.updateFacility(facility.id, facility);
    setSaved(true);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="시설 설정" description="시설 기본 정보를 관리합니다." />
      <Card className="space-y-4 p-6">
        <Field label="시설명">
          <Input value={facility.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="시설 코드" hint="AI 모델 연동 시 facilityCode 로 사용됩니다.">
          <Input value={facility.code} onChange={(e) => set("code", e.target.value)} />
        </Field>
        <Field label="주소">
          <Input value={facility.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="대표 연락처">
          <Input value={facility.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={save}>
            <Save className="h-4 w-4" />
            저장
          </Button>
          {saved && <span className="text-sm text-status-stable">저장되었습니다.</span>}
        </div>
      </Card>
    </div>
  );
}
