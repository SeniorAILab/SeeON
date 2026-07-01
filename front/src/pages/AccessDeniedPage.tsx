import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "@/components/ui/primitives";
import { defaultPathForUser } from "@/lib/routeAccess";
import { useAuthStore } from "@/store/authStore";

export function AccessDeniedPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const fallbackPath = user ? defaultPathForUser(user) : "/login";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-dangerBg text-status-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-ink">접근할 수 없는 화면입니다</h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          현재 계정 권한 또는 선택된 요양원 범위와 맞지 않는 경로입니다.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            이전 화면
          </Button>
          <Button type="button" onClick={() => navigate(fallbackPath, { replace: true })}>
            내 화면으로
          </Button>
        </div>
      </Card>
    </div>
  );
}
