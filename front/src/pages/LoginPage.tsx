import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import { defaultPathForUser } from "@/lib/routeAccess";

const DEMO_ACCOUNTS = [
  { label: "시설 관리자", email: "admin@sen.ai" },
  { label: "케어 직원", email: "staff@sen.ai" },
  { label: "통합 관리자", email: "super@sen.ai" },
  { label: "읽기 전용", email: "viewer@sen.ai" },
];

/** 카카오 심볼 (말풍선) — 공식 톤(검정 심볼 on #FEE500). */
function KakaoSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true" fill="currentColor">
      <path d="M128 36C70.56 36 24 72.9 24 118.42c0 29.43 19.47 55.22 48.74 69.67-1.6 5.7-10.27 35.46-10.62 37.8 0 0-.2 1.8.95 2.5 1.16.68 2.52.15 2.52.15 3.3-.46 38.3-25.04 44.36-29.32 6.18.87 12.52 1.32 18.05 1.32C185.44 200.84 232 163.94 232 118.42 232 72.9 185.44 36 128 36z" />
    </svg>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const kakaoLogin = useAuthStore((s) => s.kakaoLogin);
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
      if (user) navigate(defaultPathForUser(user));
    } catch {
      /* error 는 store 에서 표시 */
    }
  }

  async function handleKakaoLogin() {
    try {
      const user = await kakaoLogin();
      resolveForUser(user.facilityId ?? null);
      navigate(defaultPathForUser(user));
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
          <button
            type="button"
            onClick={handleKakaoLogin}
            disabled={loading}
            aria-label="카카오 로그인"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] px-4 py-2.5 text-sm font-bold text-[#191600] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <KakaoSymbol className="h-4 w-4" />
            카카오 로그인
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-border" />
            또는 이메일로 로그인
            <span className="h-px flex-1 bg-border" />
          </div>

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
