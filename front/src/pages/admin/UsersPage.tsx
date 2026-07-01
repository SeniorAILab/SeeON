import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/primitives";
import { adminService } from "@/services/adminService";
import { useAuthStore } from "@/store/authStore";
import { roleLabel } from "@/lib/roles";
import type { Role, User } from "@/types";

const roleChip: Record<Role, string> = {
  SUPER_ADMIN: "bg-brand-soft text-brand",
  ADMIN: "bg-status-stableBg text-status-stable",
  STAFF: "bg-status-cautionBg text-status-caution",
};

export function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    // SUPER_ADMIN 은 전체, 그 외엔 자기 시설만
    const scope = me?.role === "SUPER_ADMIN" ? null : me?.facilityId ?? null;
    adminService.listUsers(scope).then(setUsers);
  }, [me]);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="사용자" description="시설 계정과 권한을 확인합니다." />
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
                  {u.id === me?.id && (
                    <span className="ml-2 text-xs text-gray-400">(나)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={"rounded-md px-2 py-0.5 text-xs font-medium " + roleChip[u.role]}
                  >
                    {roleLabel(u.role)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-gray-400">
        MVP 데모에서는 사용자 조회만 제공합니다. 계정 생성/권한 변경은 후속 버전에서 추가됩니다.
      </p>
    </div>
  );
}
