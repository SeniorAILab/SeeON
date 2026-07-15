import { Lock } from "lucide-react";
import { canAdmin } from "@/lib/roles";
import { useAuthStore } from "@/stores/authStore";

/**
 * 영상 접근 권한 가드.
 * 서버 권한 검증에 앞서 관리자에게만 alert-bound 영상 영역을 렌더한다.
 */
export function VideoPermissionGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (canAdmin(user)) return <>{children}</>;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface2 px-4 py-5 text-sm text-ink-soft">
      <Lock className="h-5 w-5 shrink-0 text-ink-faint" />
      영상은 관리자만 확인할 수 있습니다.
    </div>
  );
}
