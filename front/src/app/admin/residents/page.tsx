"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { EmptyState } from "../../../components/EmptyState";

interface Resident {
  id: string;
  name: string;
  room: string | null;
  createdAt: string;
}

export default function ResidentsPage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRoom, setCreateRoom] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoom, setEditRoom] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<Resident[]>("/api/residents")
      .then((data) => {
        setResidents(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Resident[]>("/api/residents")
      .then((data) => {
        if (cancelled) return;
        setResidents(data);
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
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.post<Resident>("/api/residents", {
        name: createName.trim(),
        room: createRoom.trim() || undefined,
      });
      setCreateName("");
      setCreateRoom("");
      load();
    } catch (err: Error | unknown) {
      setCreateError(
        err instanceof Error ? err.message : "생성에 실패했습니다",
      );
    } finally {
      setCreating(false);
    }
  }

  function startEdit(r: Resident) {
    setEditId(r.id);
    setEditName(r.name);
    setEditRoom(r.room ?? "");
    setEditError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setEditError(null);
    try {
      await api.patch<Resident>(`/api/residents/${editId}`, {
        name: editName.trim(),
        room: editRoom.trim() || null,
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

  async function handleDelete(r: Resident) {
    if (!window.confirm(`${r.name} 대상자를 삭제할까요?`)) return;
    setDeletingId(r.id);
    setDeleteError(null);
    try {
      await api.delete<Resident>(`/api/residents/${r.id}`);
      setResidents((current) => current.filter((item) => item.id !== r.id));
    } catch (err: Error | unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "삭제에 실패했습니다",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold">대상자 관리</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/cameras"
              className="text-sm text-slate-400 hover:text-white"
            >
              카메라
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
            새 대상자 추가
          </h2>
          <div className="flex gap-3">
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="이름 *"
              required
              className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
            />
            <input
              value={createRoom}
              onChange={(e) => setCreateRoom(e.target.value)}
              placeholder="호실 (선택)"
              className="w-32 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
            />
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
        {deleteError && !loading && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {deleteError}
          </div>
        )}
        {!loading && !error && (
          <div className="flex flex-col gap-2">
            {residents.length === 0 && <EmptyState message="등록된 대상자가 없습니다" />}
            {residents.map((r) =>
              editId === r.id ? (
                <form
                  key={r.id}
                  onSubmit={handleSave}
                  className="flex gap-3 rounded-xl border border-cyan-500/30 bg-cyan-900/10 p-4"
                >
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  />
                  <input
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    placeholder="호실"
                    className="w-28 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  />
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
                    <p className="self-center text-sm text-red-400">
                      {editError}
                    </p>
                  )}
                </form>
              ) : (
                <div
                  key={r.id}
                  className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 p-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {r.room ? `${r.room}호` : "호실 미지정"} ·{" "}
                      <span className="font-mono">{r.id.slice(0, 12)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(r)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(r)}
                    disabled={deletingId === r.id}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-60"
                  >
                    {deletingId === r.id ? "삭제 중..." : "삭제"}
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
