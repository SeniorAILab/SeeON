import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { getFacility, updateFacility } from "@/services/api/facilities";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import type { Facility } from "@/types";

export function AdminFacilityPage() {
  const facilityId = useActiveFacilityId();

  const [facility, setFacility] = useState<Facility | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    getFacility(facilityId)
      .then((value) => {
        setFacility(value);
        setForm({ name: value.name, address: value.address, phone: value.phone });
        setError(null);
      })
      .catch((err) => {
        setFacility(null);
        setError(err instanceof Error ? err.message : "시설 정보를 불러오지 못했습니다.");
      });
  }, [facilityId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFacility(facilityId, form);
      setFacility(updated);
      setForm({ name: updated.name, address: updated.address, phone: updated.phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : "시설 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !facility) return <p className="text-sm text-status-danger">시설 정보를 불러오지 못했습니다. {error}</p>;
  if (!facility) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="시설 정보" description="시설 기본 정보를 수정합니다." />
      {error && <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p>}
      <Card className="p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="시설명">
            <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </Field>
          <Field label="주소">
            <Input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} required />
          </Field>
          <Field label="대표 연락처">
            <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} required />
          </Field>
          <Button type="submit" disabled={saving}>저장</Button>
        </form>
      </Card>
    </div>
  );
}
