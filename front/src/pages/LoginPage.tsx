import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, UserPlus } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { defaultPathForUser } from "@/lib/rolePolicy";
import { useFacilityStore } from "@/store/facilityStore";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";

function KakaoSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true" fill="currentColor">
      <path d="M128 36C70.56 36 24 72.9 24 118.42c0 29.43 19.47 55.22 48.74 69.67-1.6 5.7-10.27 35.46-10.62 37.8 0 0-.2 1.8.95 2.5 1.16.68 2.52.15 2.52.15 3.3-.46 38.3-25.04 44.36-29.32 6.18.87 12.52 1.32 18.05 1.32C185.44 200.84 232 163.94 232 118.42 232 72.9 185.44 36 128 36z" />
    </svg>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const kakaoLogin = useAuthStore((s) => s.kakaoLogin);
  const error = useAuthStore((s) => s.error);
  const loading = useAuthStore((s) => s.loading);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const setTheme = useUiStore((s) => s.setTheme);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const authError = authErrorMessage(searchParams.get("auth_error"));

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    setTheme(new Date().getHours() >= 19 || new Date().getHours() < 7 ? "dark" : "light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleKakaoLogin() {
    kakaoLogin();
  }

  async function handleEmailLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const user = await login({ email, password });
      resolveForUser(user.facilityId);
      navigate(defaultPathForUser(user), { replace: true });
    } catch (caught) {
      if (!(caught instanceof Error)) {
        throw caught;
      }
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-[#eef2fb] to-bg p-4">
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
            {loading ? "이동 중..." : "카카오 로그인"}
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-border" />
            또는 이메일로 로그인
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <Field label="이메일">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="이메일"
                placeholder="name@facility.com"
                autoComplete="username"
                required
              />
            </Field>

            <Field label="비밀번호">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-label="비밀번호"
                placeholder="비밀번호"
                autoComplete="current-password"
                required
              />
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? "로그인 중..." : "이메일로 로그인"}
            </Button>
          </form>

          <Button
            type="button"
            variant="secondary"
            className="mt-4 w-full"
            onClick={() => navigate("/signup")}
          >
            <UserPlus className="h-4 w-4" />
            회원가입
          </Button>

          {(authError || error) && (
            <div className="mt-4">
              <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">
                {authError ?? error}
              </p>
            </div>
          )}
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

function authErrorMessage(code: string | null): string | null {
  switch (code) {
    case "kakao_unavailable":
    case "kakao_config":
      return "카카오 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    case "kakao_unregistered":
      return "등록된 카카오 계정이 없습니다. 원장님은 회원가입을 진행하고, 직원은 관리자에게 계정 등록을 요청해 주세요.";
    default:
      return null;
  }
}
