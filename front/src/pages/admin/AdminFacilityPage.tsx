import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, Field, Input } from "@/components/ui/primitives";
import { getFacility } from "@/services/api/facilities";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import type { Facility } from "@/types";

export function AdminFacilityPage() {
  const facilityId = useActiveFacilityId();

  const [facility, setFacility] = useState<Facility | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getFacility(facilityId)
      .then((value) => {
        setFacility(value);
        setError(null);
      })
      .catch((err) => {
        setFacility(null);
        setError(err instanceof Error ? err.message : "시설 정보를 불러오지 못했습니다.");
      });
  }, [facilityId]);

  if (error) return <p className="text-sm text-status-danger">시설 정보를 불러오지 못했습니다. {error}</p>;
  if (!facility) return <p className="text-sm text-gray-400">불러오는 중...</p>;


  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="시설 정보" description="시설 기본 정보를 확인합니다." />
      <Card className="space-y-4 p-6">
        <Field label="시설명">
          <Input value={facility.name} readOnly />
        </Field>
        <Field label="주소">
          <Input value={facility.address} readOnly />
        </Field>
        <Field label="대표 연락처">
          <Input value={facility.phone} readOnly />
        </Field>
        <p className="text-sm text-ink-faint">
          시설 정보 편집은 후속 백엔드 지원이 필요합니다. 현재 화면에서는 등록된 시설 정보를
          읽기 전용으로 제공합니다.
        </p>
      </Card>
    </div>
  );
}
