"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCrud } from "../../../lib/useCrud";
import { api } from "../../../lib/api";
import { IS_DEMO } from "../../../lib/config";
import type { DemoCamera } from "../../../lib/mock/types";
import { residentName, formatTime } from "../../../lib/sse-utils";
import { EmptyState } from "../../../components/EmptyState";

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

function ProductionCamerasPage() {
  const cam = useCrud<Camera>("/api/cameras");
  const res = useCrud<Resident>("/api/residents");
  const loading = cam.loading || res.loading;
  const error = cam.error || res.error;

  // Create form
  const [createLabel, setCreateLabel] = useState("");
  const [createResidentId, setCreateResidentId] = useState("");

  // Edit form
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
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold">카메라 관리</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/residents"
              className="text-sm text-slate-400 hover:text-white"
            >
              대상자
            </Link>
            <Link
              href="/admin/guardians"
              className="text-sm text-slate-400 hover:text-white"
            >
              보호자
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-slate-400 hover:text-white"
            >
              ← 대시보드
            </Link>
          </div>
        </div>

        {/* Create form */}
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-xl border border-white/10 bg-white/5 p-5"
        >
          <h2 className="mb-4 text-sm font-semibold text-slate-300">
            새 카메라 추가
          </h2>
          <div className="flex gap-3">
            <input
              value={createLabel}
              onChange={(e) => setCreateLabel(e.target.value)}
              placeholder="카메라 레이블 *"
              required
              className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
            />
            <select
              value={createResidentId}
              onChange={(e) => setCreateResidentId(e.target.value)}
              className="w-40 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
            >
              <option value="">대상자 미지정</option>
              {res.items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.room ? ` (${r.room}호)` : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={cam.creating}
              className="rounded-xl bg-cyan-700 px-5 py-2 text-sm font-semibold transition hover:bg-cyan-600 disabled:opacity-60"
            >
              {cam.creating ? "추가 중..." : "추가"}
            </button>
          </div>
          {cam.createError && (
            <p className="mt-3 text-sm text-red-400">{cam.createError}</p>
          )}
        </form>

        {/* List */}
        {loading && (
          <div className="flex justify-center py-16">
            <span className="text-sm text-slate-500">로딩 중...</span>
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        {cam.deleteError && !loading && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {cam.deleteError}
          </div>
        )}
        {!loading && !error && (
          <div className="flex flex-col gap-2">
            {cam.items.length === 0 && (
              <EmptyState message="등록된 카메라가 없습니다" />
            )}
            {cam.items.map((c) =>
              cam.editId === c.id ? (
                <form
                  key={c.id}
                  onSubmit={handleSave}
                  className="flex flex-wrap gap-3 rounded-xl border border-cyan-500/30 bg-cyan-900/10 p-4"
                >
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    required
                    className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  />
                  <select
                    value={editResidentId}
                    onChange={(e) => setEditResidentId(e.target.value)}
                    className="w-40 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  >
                    <option value="">대상자 미지정</option>
                    {res.items.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.room ? ` (${r.room}호)` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={cam.saving}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {cam.saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={cam.cancelEdit}
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                  >
                    취소
                  </button>
                  {cam.editError && (
                    <p className="w-full text-sm text-red-400">{cam.editError}</p>
                  )}
                </form>
              ) : (
                <div
                  key={c.id}
                  className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 p-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{c.label}</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          c.online ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                        title={c.online ? "온라인" : "오프라인"}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      대상자: {residentName(res.items, c.residentId)} ·{" "}
                      <span className="font-mono">keyId:{c.ingestKeyId}</span>
                    </p>
                    {c.lastSeenAt && (
                      <p className="text-xs text-slate-600">
                        마지막 확인:{" "}
                        {formatTime(c.lastSeenAt, { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(c)}
                    disabled={cam.deletingId === c.id}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-60"
                  >
                    {cam.deletingId === c.id ? "삭제 중..." : "삭제"}
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </main>
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
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold">카메라 관리</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/residents" className="text-sm text-slate-400 hover:text-white">
              대상자
            </Link>
            <Link href="/admin/guardians" className="text-sm text-slate-400 hover:text-white">
              보호자
            </Link>
            <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
              ← 대시보드
            </Link>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <span className="text-sm text-slate-500">로딩 중...</span>
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        {!loading && !error && (
          <div className="flex flex-col gap-2">
            {cameras.length === 0 && <EmptyState message="등록된 카메라가 없습니다" />}
            {cameras.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{c.label}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      c.online ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                    title={c.online ? "온라인" : "오프라인"}
                  />
                  <span className="text-xs text-slate-400">
                    {c.online ? "온라인" : "오프라인"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  마지막 확인: {c.lastSeenAt ? formatTime(c.lastSeenAt, { dateStyle: "short", timeStyle: "short" }) : "기록 없음"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function CamerasPage() {
  if (IS_DEMO) return <DemoCamerasPage />;
  return <ProductionCamerasPage />;
}
