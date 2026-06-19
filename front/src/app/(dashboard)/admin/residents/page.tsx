"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "../../../../components/EmptyState";
import { useCrud } from "../../../../lib/useCrud";
import { inputCls, btnPrimary } from "../../../../lib/form-cls";
import { AdminHeader } from "../../../../components/AdminHeader";

interface Resident {
  id: string;
  name: string;
  room: string | null;
}

export default function ResidentsPage() {
  const c = useCrud<Resident>("/api/residents");

  // Create form
  const [createName, setCreateName] = useState("");
  const [createRoom, setCreateRoom] = useState("");

  // Edit state
  const [editName, setEditName] = useState("");
  const [editRoom, setEditRoom] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    const ok = await c.create({
      name: createName.trim(),
      room: createRoom.trim() || undefined,
    });
    if (ok) {
      setCreateName("");
      setCreateRoom("");
    }
  }

  function startEdit(r: Resident) {
    setEditName(r.name);
    setEditRoom(r.room ?? "");
    c.startEdit(r.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!c.editId) return;
    await c.save(c.editId, {
      name: editName.trim(),
      room: editRoom.trim() || null,
    });
  }

  async function handleDelete(r: Resident) {
    if (!window.confirm(`${r.name} 대상자를 삭제할까요?`)) return;
    await c.remove(r.id);
  }

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <AdminHeader
          title="대상자 관리"
          links={[
            { href: "/admin/cameras", label: "카메라" },
            { href: "/admin/guardians", label: "보호자" },
            { href: "/dashboard", label: "← 대시보드" },
          ]}
        />

        {/* Create form */}
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-card border border-line bg-surface p-5 shadow-sm"
        >
          <h2 className="mb-3 text-base font-bold text-ink">새 대상자 추가</h2>
          <p className="mb-4 text-xs text-muted">이름과 호실을 입력하세요</p>
          <div className="flex gap-3">
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="이름 *"
              required
              className={`flex-1 ${inputCls}`}
            />
            <input
              value={createRoom}
              onChange={(e) => setCreateRoom(e.target.value)}
              placeholder="호실 (선택)"
              className={`w-32 ${inputCls}`}
            />
            <button type="submit" disabled={c.creating} className={btnPrimary}>
              {c.creating ? "추가 중..." : "추가"}
            </button>
          </div>
          {c.createError && (
            <p className="mt-3 text-sm text-danger">{c.createError}</p>
          )}
        </form>

        {/* Errors */}
        {c.error && !c.loading && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">
            {c.error}
          </div>
        )}
        {c.deleteError && !c.loading && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">
            {c.deleteError}
          </div>
        )}

        {/* List */}
        {c.loading && (
          <div className="flex justify-center py-16">
            <span className="text-sm text-muted">로딩 중...</span>
          </div>
        )}
        {!c.loading && !c.error && (
          <section className="rounded-card border border-line bg-surface shadow-sm">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-base font-bold text-ink">대상자 목록</h2>
              <p className="mt-0.5 text-xs text-muted">{c.items.length}명 등록됨</p>
            </div>
            {c.items.length === 0 && (
              <div className="px-5 py-10">
                <EmptyState message="등록된 대상자가 없습니다" />
              </div>
            )}
            <div className="divide-y divide-line">
              {c.items.map((r) =>
                c.editId === r.id ? (
                  <form
                    key={r.id}
                    onSubmit={handleSave}
                    className="flex gap-3 bg-brand-weak px-5 py-4"
                  >
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-weak"
                    />
                    <input
                      value={editRoom}
                      onChange={(e) => setEditRoom(e.target.value)}
                      placeholder="호실"
                      className="w-28 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-weak"
                    />
                    <button
                      type="submit"
                      disabled={c.saving}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-ink disabled:opacity-60"
                    >
                      {c.saving ? "저장 중..." : "저장"}
                    </button>
                    <button
                      type="button"
                      onClick={c.cancelEdit}
                      className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
                    >
                      취소
                    </button>
                    {c.editError && (
                      <p className="self-center text-sm text-danger">{c.editError}</p>
                    )}
                  </form>
                ) : (
                  <div
                    key={r.id}
                    className="flex items-center gap-4 px-5 py-4"
                  >
                    <Link
                      href={`/admin/residents/${r.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4 transition hover:opacity-80"
                    >
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-weak text-sm font-bold text-brand-ink">
                        {r.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{r.name}</p>
                        <p className="mt-0.5 text-xs text-muted tabular-nums">
                          {r.room ? `${r.room}호` : "호실 미지정"} ·{" "}
                          <span className="font-mono">{r.id.slice(0, 12)}</span>
                        </p>
                      </div>
                    </Link>
                    <button
                      onClick={() => startEdit(r)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:text-ink"
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(r)}
                      disabled={c.deletingId === r.id}
                      className="rounded-lg border border-danger/20 px-3 py-1.5 text-xs text-danger transition hover:border-danger/40 disabled:opacity-60"
                    >
                      {c.deletingId === r.id ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                ),
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
