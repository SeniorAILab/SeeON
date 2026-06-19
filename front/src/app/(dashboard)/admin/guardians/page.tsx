"use client";

import { useState } from "react";
import { useCrud } from "../../../../lib/useCrud";
import { useDemoRole } from "../../../../lib/useDemoRole";
import { canSeeFullPhone } from "../../../../lib/mock/session";
import { maskPhone, residentName } from "../../../../lib/sse-utils";
import { EmptyState } from "../../../../components/EmptyState";
import { inputCls, btnPrimary } from "../../../../lib/form-cls";
import { AdminHeader } from "../../../../components/AdminHeader";

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
  const role = useDemoRole();
  const showFullPhone = canSeeFullPhone(role);
  const gd = useCrud<Guardian>("/api/guardians");
  const res = useCrud<Resident>("/api/residents");
  const loading = gd.loading || res.loading;
  const error = gd.error || res.error;

  const [createResidentId, setCreateResidentId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRelation, setCreateRelation] = useState("");

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
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <AdminHeader
          title="보호자 관리"
          links={[
            { href: "/admin/residents", label: "대상자" },
            { href: "/admin/cameras", label: "카메라" },
            { href: "/dashboard", label: "← 대시보드" },
          ]}
        />

        {/* Create form */}
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-card border border-line bg-surface p-5 shadow-sm"
        >
          <h2 className="text-base font-bold text-ink">새 보호자 추가</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted">대상자를 선택하고 보호자 정보를 입력하세요</p>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={createResidentId}
              onChange={(e) => setCreateResidentId(e.target.value)}
              required
              className={`col-span-2 ${inputCls}`}
            >
              <option value="">대상자 선택 *</option>
              {res.items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.room ? ` (${r.room}호)` : ""}
                </option>
              ))}
            </select>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="보호자 이름 *"
              required
              className={inputCls}
            />
            <input
              value={createPhone}
              onChange={(e) => setCreatePhone(e.target.value)}
              placeholder="전화번호 *"
              required
              className={inputCls}
            />
            <input
              value={createRelation}
              onChange={(e) => setCreateRelation(e.target.value)}
              placeholder="관계 (선택)"
              className={inputCls}
            />
            <button type="submit" disabled={gd.creating} className={btnPrimary}>
              {gd.creating ? "추가 중..." : "추가"}
            </button>
          </div>
          {gd.createError && <p className="mt-3 text-sm text-danger">{gd.createError}</p>}
        </form>

        {/* Error banners */}
        {error && !loading && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">{error}</div>
        )}
        {gd.deleteError && !loading && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">{gd.deleteError}</div>
        )}

        {/* Guardian table */}
        <section className="rounded-card border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-bold text-ink">보호자 목록</h2>
            <p className="mt-0.5 text-xs text-muted">
              {loading ? "로딩 중..." : `${gd.items.length}명 등록`}
            </p>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <span className="text-sm text-muted">로딩 중...</span>
            </div>
          ) : gd.items.length === 0 ? (
            <div className="p-5">
              <EmptyState message="등록된 보호자가 없습니다" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">이름</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">관계</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">전화번호</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">대상자</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {gd.items.map((g) =>
                    gd.editId === g.id ? (
                      <tr key={g.id} className="bg-brand-weak/40">
                        <td colSpan={5} className="px-4 py-3">
                          <form onSubmit={handleSave} className="flex flex-wrap gap-3">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              required
                              placeholder="이름"
                              className={inputCls}
                            />
                            <input
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              required
                              placeholder="전화번호"
                              className={`tabular-nums ${inputCls}`}
                            />
                            <input
                              value={editRelation}
                              onChange={(e) => setEditRelation(e.target.value)}
                              placeholder="관계"
                              className={inputCls}
                            />
                            <button type="submit" disabled={gd.saving} className={btnPrimary}>
                              {gd.saving ? "저장 중..." : "저장"}
                            </button>
                            <button
                              type="button"
                              onClick={gd.cancelEdit}
                              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
                            >
                              취소
                            </button>
                            {gd.editError && (
                              <p className="w-full text-sm text-danger">{gd.editError}</p>
                            )}
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={g.id} className="transition hover:bg-surface-2">
                        <td className="px-4 py-3 font-medium text-ink">{g.name}</td>
                        <td className="px-4 py-3 text-ink-2">{g.relation ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-ink-2">{showFullPhone ? g.phone : maskPhone(g.phone)}</td>
                        <td className="px-4 py-3 text-muted">{residentName(res.items, g.residentId)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(g)}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:text-ink"
                            >
                              편집
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(g)}
                              disabled={gd.deletingId === g.id}
                              className="rounded-lg border border-danger/20 px-3 py-1.5 text-xs text-danger transition hover:border-danger/40 disabled:opacity-60"
                            >
                              {gd.deletingId === g.id ? "삭제 중..." : "삭제"}
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
