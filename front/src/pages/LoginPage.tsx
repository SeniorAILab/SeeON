import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

const DEMO_ACCOUNTS = [
  { label: "시설 관리자", email: "admin@sen.ai" },
  { label: "케어 직원", email: "staff@sen.ai" },
  { label: "통합 관리자", email: "super@sen.ai" },
  { label: "읽기 전용", email: "viewer@sen.ai" },
];

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const loading = useAuthStore((s) => s.loading);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const setTheme = useUiStore((s) => s.setTheme);

  const [email, setEmail] = useState("staff@sen.ai");
  const [password, setPassword] = useState("1234");

  // 로그인 화면은 항상 밝게
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    setTheme(new Date().getHours() >= 19 || new Date().getHours() < 7 ? "dark" : "light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      const user = useAuthStore.getState().user;
      resolveForUser(user?.facilityId ?? null);
      navigate("/now");
    } catch {
      /* error 는 store 에서 표시 */
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#eef2fb] to-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-3" />
          <h1 className="text-xl font-bold text-ink">Senior AI Lab</h1>
          <p className="mt-1 text-sm text-ink-soft">요양원 안전 확인 시스템</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="이메일">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@facility.com"
                autoComplete="username"
              />
            </Field>
            <Field label="비밀번호">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>

            {error && (
              <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-xs text-gray-400">데모 계정 (비밀번호 1234)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("1234");
                  }}
                  className="rounded-lg border border-border px-2 py-1.5 text-left text-xs text-ink-soft hover:border-brand/40 hover:bg-brand-soft"
                >
                  <div className="font-medium text-ink">{a.label}</div>
                  <div className="truncate text-gray-400">{a.email}</div>
                </button>
              ))}
            </div>
          </div>
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
