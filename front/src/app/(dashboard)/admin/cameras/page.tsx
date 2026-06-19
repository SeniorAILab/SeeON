"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCrud } from "../../../../lib/useCrud";
import { api } from "../../../../lib/api";
import { IS_DEMO } from "../../../../lib/config";
import type { DemoCamera } from "../../../../lib/mock/types";
import { residentName, formatTime } from "../../../../lib/sse-utils";
import { EmptyState } from "../../../../components/EmptyState";
import { inputCls, btnPrimary } from "../../../../lib/form-cls";

interface Camera {
  id: string;
  label: string;
  residentId: string | null;
  ingestKeyId: string;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

interface Resident {
  id: string;
  name: string;
  room: string | null;
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`size-2 rounded-full ${online ? "bg-ok" : "bg-muted"}`}
        aria-hidden="true"
      />
      <span className={`text-xs ${online ? "text-ok" : "text-muted"}`}>
        {online ? "온라인" : "오프라인"}
      </span>
    </span>
  );
}

function ProductionCamerasPage() {
  const cam = useCrud<Camera>("/api/cameras");
  const res = useCrud<Resident>("/api/residents");
  const loading = cam.loading || res.loading;
  const error = cam.error || res.error;

  const [createLabel, setCreateLabel] = useState("");
  const [createResidentId, setCreateResidentId] = useState("");

  const [editLabel, setEditLabel] = useState("");
  const [editResidentId, setEditResidentId] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createLabel.trim()) return;
    const ok = await cam.create({
      label: createLabel.trim(),
      residentId: createResidentId || undefined,
    });
    if (ok) {
      setCreateLabel("");
      setCreateResidentId("");
    }
  }

  function startEdit(c: Camera) {
    setEditLabel(c.label);
    setEditResidentId(c.residentId ?? "");
    cam.startEdit(c.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!cam.editId) return;
    await cam.save(cam.editId, {
      label: editLabel.trim(),
      residentId: editResidentId || null,
    });
  }

  async function handleDelete(c: Camera) {
    if (!window.confirm(`${c.label} 카메라를 삭제할까요?`)) return;
    await cam.remove(c.id);
  }

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-ink text-balance">카메라 관리</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/residents" className="text-sm text-ink-2 hover:text-ink">대상자</Link>
            <Link href="/admin/guardians" className="text-sm text-ink-2 hover:text-ink">보호자</Link>
            <Link href="/dashboard" className="text-sm text-ink-2 hover:text-ink">← 대시보드</Link>
          </div>
        </div>

        {/* Create form */}
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-card border border-line bg-surface p-5 shadow-sm"
        >
          <h2 className="text-base font-bold text-ink">새 카메라 추가</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted">레이블을 입력하고 대상자를 지정하세요</p>
          <div className="flex gap-3">
            <input
              value={createLabel}
              onChange={(e) => setCreateLabel(e.target.value)}
              placeholder="카메라 레이블 *"
              required
              className={`flex-1 ${inputCls}`}
            />
            <select
              value={createResidentId}
              onChange={(e) => setCreateResidentId(e.target.value)}
              className={`w-40 ${inputCls}`}
            >
              <option value="">대상자 미지정</option>
              {res.items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.room ? ` (${r.room}호)` : ""}
                </option>
              ))}
            </select>
            <button type="submit" disabled={cam.creating} className={btnPrimary}>
              {cam.creating ? "추가 중..." : "추가"}
            </button>
          </div>
          {cam.createError && <p className="mt-3 text-sm text-danger">{cam.createError}</p>}
        </form>

        {/* Error banners */}
        {error && !loading && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">{error}</div>
        )}
        {cam.deleteError && !loading && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">{cam.deleteError}</div>
        )}

        {/* Camera table */}
        <section className="rounded-card border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-bold text-ink">카메라 목록</h2>
            <p className="mt-0.5 text-xs text-muted">
              {loading ? "로딩 중..." : `${cam.items.length}개 등록`}
            </p>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <span className="text-sm text-muted">로딩 중...</span>
            </div>
          ) : cam.items.length === 0 ? (
            <div className="p-5">
              <EmptyState message="등록된 카메라가 없습니다" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">레이블</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">상태</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">대상자</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">마지막 확인</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {cam.items.map((c) =>
                    cam.editId === c.id ? (
                      <tr key={c.id} className="bg-brand-weak/40">
                        <td colSpan={5} className="px-4 py-3">
                          <form onSubmit={handleSave} className="flex flex-wrap gap-3">
                            <input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              required
                              className={`flex-1 ${inputCls}`}
                            />
                            <select
                              value={editResidentId}
                              onChange={(e) => setEditResidentId(e.target.value)}
                              className={`w-40 ${inputCls}`}
                            >
                              <option value="">대상자 미지정</option>
                              {res.items.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}{r.room ? ` (${r.room}호)` : ""}
                                </option>
                              ))}
                            </select>
                            <button type="submit" disabled={cam.saving} className={btnPrimary}>
                              {cam.saving ? "저장 중..." : "저장"}
                            </button>
                            <button
                              type="button"
                              onClick={cam.cancelEdit}
                              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
                            >
                              취소
                            </button>
                            {cam.editError && (
                              <p className="w-full text-sm text-danger">{cam.editError}</p>
                            )}
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={c.id} className="transition hover:bg-surface-2">
                        <td className="px-4 py-3 font-medium text-ink">{c.label}</td>
                        <td className="px-4 py-3">
                          <OnlineDot online={c.online} />
                        </td>
                        <td className="px-4 py-3 text-muted">{residentName(res.items, c.residentId)}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">
                          {c.lastSeenAt
                            ? formatTime(c.lastSeenAt, { dateStyle: "short", timeStyle: "short" })
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(c)}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:text-ink"
                            >
                              편집
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(c)}
                              disabled={cam.deletingId === c.id}
                              className="rounded-lg border border-danger/20 px-3 py-1.5 text-xs text-danger transition hover:border-danger/40 disabled:opacity-60"
                            >
                              {cam.deletingId === c.id ? "삭제 중..." : "삭제"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DemoCamerasPage() {
  const [cameras, setCameras] = useState<DemoCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<DemoCamera[]>("/api/cameras")
      .then((data) => {
        if (cancelled) return;
        setCameras(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-ink text-balance">카메라 관리</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/residents" className="text-sm text-ink-2 hover:text-ink">대상자</Link>
            <Link href="/admin/guardians" className="text-sm text-ink-2 hover:text-ink">보호자</Link>
            <Link href="/dashboard" className="text-sm text-ink-2 hover:text-ink">← 대시보드</Link>
          </div>
        </div>

        {error && !loading && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">{error}</div>
        )}

        <section className="rounded-card border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-bold text-ink">카메라 목록</h2>
            <p className="mt-0.5 text-xs text-muted">
              {loading ? "로딩 중..." : `${cameras.length}개 등록`}
            </p>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <span className="text-sm text-muted">로딩 중...</span>
            </div>
          ) : cameras.length === 0 ? (
            <div className="p-5">
              <EmptyState message="등록된 카메라가 없습니다" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">레이블</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">상태</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">마지막 확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {cameras.map((c) => (
                    <tr key={c.id} className="transition hover:bg-surface-2">
                      <td className="px-4 py-3 font-medium text-ink">{c.label}</td>
                      <td className="px-4 py-3">
                        <OnlineDot online={c.online} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {c.lastSeenAt
                          ? formatTime(c.lastSeenAt, { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function CamerasPage() {
  if (IS_DEMO) return <DemoCamerasPage />;
  return <ProductionCamerasPage />;
}
