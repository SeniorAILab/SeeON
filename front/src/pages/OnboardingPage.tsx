import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Building2, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { defaultPathForUser } from "@/lib/routeAccess";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import { useUiStore } from "@/store/uiStore";

export function OnboardingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const createFacility = useAuthStore((s) => s.createFacility);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const setTheme = useUiStore((s) => s.setTheme);
  const [facilityName, setFacilityName] = useState("");

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    setTheme("light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!initialized) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.facilityId) return <Navigate to={defaultPathForUser(user)} replace />;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = facilityName.trim();
    if (!name) return;

    try {
      const created = await createFacility({
        facilityName: name,
      });
      resolveForUser(created.facilityId ?? null);
      navigate(defaultPathForUser(created), { replace: true });
    } catch {
      return;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-3" />
          <h1 className="text-xl font-bold text-ink">시설 등록</h1>
          <p className="mt-1 text-sm text-ink-soft">등록된 계정의 시설을 연결합니다.</p>
        </div>

        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{user.name}</p>
              <p className="text-xs text-ink-soft">계정 확인 완료</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="시설명">
              <Input
                value={facilityName}
                onChange={(event) => setFacilityName(event.target.value)}
                placeholder="예: 늘봄 요양원"
                autoComplete="organization"
                required
              />
            </Field>

            {error && (
              <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading || !facilityName.trim()}>
              {loading ? "등록 중..." : "시설 등록"}
            </Button>
          </form>
        </Card>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          CCTV 영상은 노출하지 않습니다. AI 분석 결과만 표시합니다.
        </p>
        <PrivacyNotice className="mt-1.5" />
      </div>
    </div>
  );
}
