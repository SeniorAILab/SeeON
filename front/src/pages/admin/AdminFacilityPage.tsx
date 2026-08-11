import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { getFacility, getFacilityEdgeStatus, updateFacility } from "@/services/api/facilities";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import type { EdgeConnectionState, Facility, FacilityEdgeStatus } from "@/types";

const EDGE_CONNECTION_LABEL: Record<EdgeConnectionState, string> = {
  CONNECTED: "연결됨",
  STALE: "연결 지연",
  NOT_ENROLLED: "미등록",
};

const EDGE_CONNECTION_BADGE_CLASS: Record<EdgeConnectionState, string> = {
  CONNECTED: "bg-status-stableBg text-status-stable",
  STALE: "bg-status-dangerBg text-status-danger",
  NOT_ENROLLED: "bg-gray-100 text-gray-400",
};

function formatTimestamp(value: string | null): string {
  if (!value) return "없음";
  return new Date(value).toLocaleString("ko-KR");
}

export function AdminFacilityPage() {
  const facilityId = useActiveFacilityId();

  const [facility, setFacility] = useState<Facility | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<FacilityEdgeStatus | null>(null);
  const [edgeStatusError, setEdgeStatusError] = useState<string | null>(null);

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

  useEffect(() => {
    setEdgeStatus(null);
    setEdgeStatusError(null);
    getFacilityEdgeStatus(facilityId)
      .then((value) => setEdgeStatus(value))
      .catch((err) => {
        setEdgeStatusError(err instanceof Error ? err.message : "Edge 상태를 불러오지 못했습니다.");
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

      <Card className="space-y-3 p-6">
        <h3 className="font-semibold text-ink">Edge 연결 상태</h3>
        {edgeStatusError && (
          <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{edgeStatusError}</p>
        )}
        {!edgeStatusError && !edgeStatus && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {edgeStatus && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <dt className="text-ink-soft">연결 상태</dt>
              <dd>
                <span
                  className={
                    "rounded-md px-2 py-0.5 text-xs font-medium " +
                    EDGE_CONNECTION_BADGE_CLASS[edgeStatus.connectionState]
                  }
                >
                  {EDGE_CONNECTION_LABEL[edgeStatus.connectionState]}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-soft">마지막 heartbeat</dt>
              <dd className="text-ink">{formatTimestamp(edgeStatus.lastHeartbeatAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-soft">마지막 동기화</dt>
              <dd className="text-ink">{formatTimestamp(edgeStatus.lastSyncedAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <dt className="text-ink-soft">정상 카메라</dt>
              <dd className="text-ink">
                {edgeStatus.healthyCameraCount} / {edgeStatus.totalCameraCount}
              </dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
