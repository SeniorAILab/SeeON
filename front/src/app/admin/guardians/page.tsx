"use client";

import { useState } from "react";
import Link from "next/link";
import { useCrud } from "../../../lib/useCrud";
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
  const gd = useCrud<Guardian>("/api/guardians");
  const res = useCrud<Resident>("/api/residents");
  const loading = gd.loading || res.loading;
  const error = gd.error || res.error;

  // Create form
  const [createResidentId, setCreateResidentId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRelation, setCreateRelation] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRelation, setEditRelation] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createResidentId || !createName.trim() || !createPhone.trim()) return;
    const ok = await gd.create({
      residentId: createResidentId,
      name: createName.trim(),
      phone: createPhone.trim(),
      relation: createRelation.trim() || undefined,
    });
    if (ok) {
      setCreateResidentId("");
      setCreateName("");
      setCreatePhone("");
      setCreateRelation("");
    }
  }

  function startEdit(g: Guardian) {
    setEditName(g.name);
    setEditPhone(g.phone);
    setEditRelation(g.relation ?? "");
    gd.startEdit(g.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!gd.editId) return;
    await gd.save(gd.editId, {
      name: editName.trim(),
      phone: editPhone.trim(),
      relation: editRelation.trim() || null,
    });
  }

  async function handleDelete(g: Guardian) {
    if (!window.confirm(`${g.name} 보호자를 삭제할까요?`)) return;
    await gd.remove(g.id);
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
              {res.items.map((r) => (
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
              disabled={gd.creating}
              className="rounded-xl bg-cyan-700 px-5 py-2 text-sm font-semibold transition hover:bg-cyan-600 disabled:opacity-60"
            >
              {gd.creating ? "추가 중..." : "추가"}
            </button>
          </div>
          {gd.createError && (
            <p className="mt-3 text-sm text-red-400">{gd.createError}</p>
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
        {gd.deleteError && !loading && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {gd.deleteError}
          </div>
        )}
        {!loading && !error && (
          <div className="flex flex-col gap-2">
            {gd.items.length === 0 && (
              <EmptyState message="등록된 보호자가 없습니다" />
            )}
            {gd.items.map((g) =>
              gd.editId === g.id ? (
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
                      disabled={gd.saving}
                      className="flex-1 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold transition hover:bg-emerald-600 disabled:opacity-60"
                    >
                      {gd.saving ? "저장 중..." : "저장"}
                    </button>
                    <button
                      type="button"
                      onClick={gd.cancelEdit}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                    >
                      취소
                    </button>
                  </div>
                  {gd.editError && (
                    <p className="col-span-2 text-sm text-red-400">
                      {gd.editError}
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
                      대상자: {residentName(res.items, g.residentId)}
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
                    disabled={gd.deletingId === g.id}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-60"
                  >
                    {gd.deletingId === g.id ? "삭제 중..." : "삭제"}
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
