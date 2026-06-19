import { cookies } from "next/headers";
import Link from "next/link";

import { CAMERAS, RESIDENTS } from "../../../../lib/mock/fixtures";
import { BACKEND_ORIGIN, isServerDemo } from "../../../../lib/config";
import { formatTime } from "../../../../lib/sse-utils";
import { fetchJson } from "../../../../lib/server-fetch";

// ponytail: ingestKeyId is a fixture/demo-only field; backend shape may omit it.
type Camera = {
  id: string;
  label: string;
  residentId: string | null;
  online: boolean;
  lastSeenAt: string | null;
  ingestKeyId?: string;
};

type Resident = { id: string; name: string; room: string };

function residentLabel(residents: Resident[], residentId: string | null) {
  if (!residentId) return "미지정";
  const resident = residents.find((item) => item.id === residentId);
  return resident ? `${resident.name} · ${resident.room}호` : "미지정";
}

export default async function DevicesSettingsPage() {
  let cameras: Camera[];
  let residents: Resident[];

  if (isServerDemo()) {
    cameras = CAMERAS;
    residents = RESIDENTS;
  } else {
    const cookieHeader = (await cookies()).toString();
    const [c, r] = await Promise.all([
      fetchJson<Camera[]>(`${BACKEND_ORIGIN}/api/cameras`, cookieHeader),
      fetchJson<Resident[]>(`${BACKEND_ORIGIN}/api/residents`, cookieHeader),
    ]);
    cameras = c ?? [];
    residents = r ?? [];
  }

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">설정</p>
            <h1 className="mt-1 text-2xl font-bold text-balance text-ink">장치</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            ← 대시보드
          </Link>
        </div>

        <div className="mb-3">
          <h2 className="text-base font-bold text-ink">카메라 장치 목록</h2>
          <p className="mt-0.5 text-xs text-muted">연결된 카메라와 입소자 배정 현황</p>
        </div>

        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <div className="grid grid-cols-5 gap-4 border-b border-line bg-surface-2 px-5 py-3 text-xs font-semibold text-muted">
            <span>장치명</span>
            <span>배정</span>
            <span>상태</span>
            <span>최근 신호</span>
            <span>수집 키</span>
          </div>
          {cameras.map((camera) => (
            <div
              key={camera.id}
              className="grid grid-cols-5 gap-4 border-b border-line px-5 py-4 text-sm last:border-b-0"
            >
              <span className="font-semibold text-ink">{camera.label}</span>
              <span className="text-ink-2">{residentLabel(residents, camera.residentId)}</span>
              <span>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                    camera.online
                      ? "bg-ok-weak text-ok"
                      : "bg-danger-weak text-danger"
                  }`}
                >
                  <span
                    className={`size-2 rounded-full ${
                      camera.online ? "bg-ok" : "bg-danger"
                    }`}
                  />
                  {camera.online ? "온라인" : "오프라인"}
                </span>
              </span>
              <span className="tabular-nums text-muted">
                {camera.lastSeenAt ? formatTime(camera.lastSeenAt) : "기록 없음"}
              </span>
              <span className="flex items-center justify-between gap-3 text-muted">
                {camera.ingestKeyId ? (
                  <code className="rounded-xl border border-line bg-surface-2 px-2 py-1 text-xs text-ink-2">
                    {camera.ingestKeyId}
                  </code>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
                <button
                  type="button"
                  disabled
                  className="rounded-xl border border-line px-3 py-1 text-xs font-semibold text-muted"
                >
                  시크릿 재발급
                </button>
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
