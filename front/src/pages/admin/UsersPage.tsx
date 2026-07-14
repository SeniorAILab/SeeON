import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { useAuthStore } from "@/stores/authStore";
import { roleLabel } from "@/lib/roles";
import { createUser, listUsers, updateUserRole } from "@/services/api/users";
import type { Role, User } from "@/types";
import { apiErrorMessage } from "@/services/apiClient";

const roleChip: Record<Role, string> = {
  SUPER_ADMIN: "bg-brand-soft text-brand",
  ADMIN: "bg-status-stableBg text-status-stable",
  STAFF: "bg-status-cautionBg text-status-caution",
};

const assignableRoles: Exclude<Role, "SUPER_ADMIN">[] = ["ADMIN", "STAFF"];

export function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "SUPER_ADMIN">>("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<{ name: string; password: string } | null>(null);

  async function refresh() {
    setUsers(await listUsers());
  }

  useEffect(() => {
    setError(null);
    refresh().catch((err) => setError(apiErrorMessage(err, "사용자 목록을 불러오지 못했습니다.")));
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCreatedPassword(null);
    try {
      const result = await createUser({ name, email, role });
      setName("");
      setEmail("");
      setRole("STAFF");
      setCreatedPassword({ name: result.user.name, password: result.initialPassword });
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "사용자를 생성하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, nextRole: Exclude<Role, "SUPER_ADMIN">) {
    setError(null);
    try {
      await updateUserRole(userId, nextRole);
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "권한을 변경하지 못했습니다."));
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="사용자" description="시설 사용자를 조회하고 계정을 생성하거나 권한을 변경합니다." />
      {error && <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p>}
      {createdPassword && (
        <p className="rounded-lg bg-status-stableBg px-3 py-2 text-sm text-status-stable">
          {createdPassword.name} 초기 비밀번호: <span className="font-semibold">{createdPassword.password}</span>
        </p>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-gray-50 text-left text-xs text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">이름</th>
              <th className="px-4 py-2.5 font-medium">이메일</th>
              <th className="px-4 py-2.5 font-medium">권한</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink">
                  {u.name}
                  {u.id === me?.id && <span className="ml-2 text-xs text-gray-400">(나)</span>}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{u.email}</td>
                <td className="px-4 py-2.5">
                  {u.role === "SUPER_ADMIN" ? (
                    <span className={"rounded-md px-2 py-0.5 text-xs font-medium " + roleChip[u.role]}>{roleLabel(u.role)}</span>
                  ) : (
                    <select
                      aria-label={`${u.name} 권한`}
                      value={u.role}
                      onChange={(event) => handleRoleChange(u.id, event.target.value as Exclude<Role, "SUPER_ADMIN">)}
                      className={"rounded-md border border-border px-2 py-1 text-xs font-medium " + roleChip[u.role]}
                    >
                      {assignableRoles.map((value) => (
                        <option key={value} value={value}>{roleLabel(value)}</option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="p-5">
        <form className="grid gap-3 md:grid-cols-[1fr_1.5fr_8rem_auto]" onSubmit={handleCreate}>
          <Field label="이름"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="이메일"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
          <Field label="권한">
            <select className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={role} onChange={(event) => setRole(event.target.value as Exclude<Role, "SUPER_ADMIN">)}>
              {assignableRoles.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><Button type="submit" disabled={saving}>생성</Button></div>
        </form>
      </Card>
    </div>
  );
}
