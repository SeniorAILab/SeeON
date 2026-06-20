import { Lock } from "lucide-react";
import { canAdmin } from "@/store/authStore";
import { useAuthStore } from "@/store/authStore";

/**
 * 영상 접근 권한 가드.
 * 관리자만 children(영상 영역)을 렌더. 그 외에는 안내 문구만.
 * (서버에서도 동일 검증을 해야 하며, 직원은 signed URL 자체를 받지 못한다.)
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
