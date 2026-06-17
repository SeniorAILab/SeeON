"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { maskPhone, residentName } from "../../../lib/sse-utils";
import { EmptyState } from "../../../components/EmptyState";

interface Guardian {
  id: string;
  residentId: string;
  name: string;
  phone: string;
  relation: string | null;
  createdAt: string;
}

interface Resident {
  id: string;
  name: string;
  room: string | null;
}

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createResidentId, setCreateResidentId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRelation, setCreateRelation] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRelation, setEditRelation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<Guardian[]>("/api/guardians"),
      api.get<Resident[]>("/api/residents"),
    ])
      .then(([gds, res]) => {
        setGuardians(gds);
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
      api.get<Guardian[]>("/api/guardians"),
      api.get<Resident[]>("/api/residents"),
    ])
      .then(([gds, res]) => {
        if (cancelled) return;
        setGuardians(gds);
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
    if (!createResidentId || !createName.trim() || !createPhone.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.post<Guardian>("/api/guardians", {
        residentId: createResidentId,
        name: createName.trim(),
        phone: createPhone.trim(),
        relation: createRelation.trim() || undefined,
      });
      setCreateResidentId("");
      setCreateName("");
      setCreatePhone("");
      setCreateRelation("");
      load();
    } catch (err: Error | unknown) {
      setCreateError(
        err instanceof Error ? err.message : "생성에 실패했습니다",
      );
    } finally {
      setCreating(false);
    }
  }

  function startEdit(g: Guardian) {
    setEditId(g.id);
    setEditName(g.name);
    setEditPhone(g.phone);
    setEditRelation(g.relation ?? "");
    setEditError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setEditError(null);
    try {
      await api.patch<Guardian>(`/api/guardians/${editId}`, {
        name: editName.trim(),
        phone: editPhone.trim(),
        relation: editRelation.trim() || null,
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

  async function handleDelete(g: Guardian) {
    if (!window.confirm(`${g.name} 보호자를 삭제할까요?`)) return;
    setDeletingId(g.id);
    setDeleteError(null);
    try {
      await api.delete<Guardian>(`/api/guardians/${g.id}`);
      setGuardians((current) => current.filter((item) => item.id !== g.id));
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
            <h1 className="mt-1 text-2xl font-bold">보호자 관리</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/residents"
              className="text-sm text-slate-400 hover:text-white"
            >
              대상자
            </Link>
            <Link
              href="/admin/cameras"
              className="text-sm text-slate-400 hover:text-white"
            >
              카메라
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
            새 보호자 추가
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={createResidentId}
              onChange={(e) => setCreateResidentId(e.target.value)}
              required
              className="col-span-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
            >
              <option value="">대상자 선택 *</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.room ? ` (${r.room}호)` : ""}
                </option>
              ))}
            </select>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="보호자 이름 *"
              required
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
            />
            <input
              value={createPhone}
              onChange={(e) => setCreatePhone(e.target.value)}
              placeholder="전화번호 *"
              required
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
            />
            <input
              value={createRelation}
              onChange={(e) => setCreateRelation(e.target.value)}
              placeholder="관계 (선택)"
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
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
            {guardians.length === 0 && (
              <EmptyState message="등록된 보호자가 없습니다" />
            )}
            {guardians.map((g) =>
              editId === g.id ? (
                <form
                  key={g.id}
                  onSubmit={handleSave}
                  className="grid grid-cols-2 gap-3 rounded-xl border border-cyan-500/30 bg-cyan-900/10 p-4"
                >
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    placeholder="이름"
                    className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    required
                    placeholder="전화번호"
                    className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  />
                  <input
                    value={editRelation}
                    onChange={(e) => setEditRelation(e.target.value)}
                    placeholder="관계"
                    className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold transition hover:bg-emerald-600 disabled:opacity-60"
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
                  </div>
                  {editError && (
                    <p className="col-span-2 text-sm text-red-400">
                      {editError}
                    </p>
                  )}
                </form>
              ) : (
                <div
                  key={g.id}
                  className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 p-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{g.name}</span>
                      {g.relation && (
                        <span className="text-xs text-slate-400">
                          ({g.relation})
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300">
                      {/* Phone masked per P5/PII minimization */}
                      {maskPhone(g.phone)}
                    </p>
                    <p className="text-xs text-slate-500">
                      대상자: {residentName(residents, g.residentId)}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(g)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(g)}
                    disabled={deletingId === g.id}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-60"
                  >
                    {deletingId === g.id ? "삭제 중..." : "삭제"}
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
