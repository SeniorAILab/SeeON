"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

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

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [createResidentId, setCreateResidentId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editResidentId, setEditResidentId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<Camera[]>("/api/cameras"),
      api.get<Resident[]>("/api/residents"),
    ])
      .then(([cams, res]) => {
        setCameras(cams);
        setResidents(res);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<Camera[]>("/api/cameras"),
      api.get<Resident[]>("/api/residents"),
    ])
      .then(([cams, res]) => {
        if (cancelled) return;
        setCameras(cams);
        setResidents(res);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createLabel.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.post<Camera>("/api/cameras", {
        label: createLabel.trim(),
        residentId: createResidentId || undefined,
      });
      setCreateLabel("");
      setCreateResidentId("");
      load();
    } catch (err: Error | unknown) {
      setCreateError(
        err instanceof Error ? err.message : "생성에 실패했습니다",
      );
    } finally {
      setCreating(false);
    }
  }

  function startEdit(c: Camera) {
    setEditId(c.id);
    setEditLabel(c.label);
    setEditResidentId(c.residentId ?? "");
    setEditError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setEditError(null);
    try {
      await api.patch<Camera>(`/api/cameras/${editId}`, {
        label: editLabel.trim(),
        residentId: editResidentId || undefined,
      });
      setEditId(null);
      load();
    } catch (err: Error | unknown) {
      setEditError(
        err instanceof Error ? err.message : "저장에 실패했습니다",
      );
    } finally {
      setSaving(false);
    }
  }

  function residentName(id: string | null): string {
    if (!id) return "미지정";
    return residents.find((r) => r.id === id)?.name ?? id.slice(0, 8);
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
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.room ? ` (${r.room}호)` : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-cyan-700 px-5 py-2 text-sm font-semibold transition hover:bg-cyan-600 disabled:opacity-60"
            >
              {creating ? "추가 중..." : "추가"}
            </button>
          </div>
          {createError && (
            <p className="mt-3 text-sm text-red-400">{createError}</p>
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
        {!loading && !error && (
          <div className="flex flex-col gap-2">
            {cameras.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">
                등록된 카메라가 없습니다
              </div>
            )}
            {cameras.map((c) =>
              editId === c.id ? (
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
                    {residents.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.room ? ` (${r.room}호)` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                  >
                    취소
                  </button>
                  {editError && (
                    <p className="w-full text-sm text-red-400">{editError}</p>
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
                      대상자: {residentName(c.residentId)} ·{" "}
                      <span className="font-mono">keyId:{c.ingestKeyId}</span>
                    </p>
                    {c.lastSeenAt && (
                      <p className="text-xs text-slate-600">
                        마지막 확인:{" "}
                        {new Intl.DateTimeFormat("ko-KR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(c.lastSeenAt))}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
                  >
                    편집
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
