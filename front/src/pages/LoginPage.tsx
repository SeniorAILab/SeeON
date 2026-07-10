import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, UserPlus } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { defaultPathForUser } from "@/lib/routeAccess";
import { useFacilityStore } from "@/stores/facilityStore";
import { useUiStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
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

  async function handleEmailLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const user = await login({ email, password });
      resolveForUser(user.facilityId);
      navigate(loginDestination(location.state, user), { replace: true });
    } catch (caught) {
      if (!(caught instanceof Error)) {
        throw caught;
      }
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-3" />
          <h1 className="text-xl font-bold text-ink">Senior AI Lab</h1>
          <p className="mt-1 text-sm text-ink-soft">요양원 안전 확인 시스템</p>
        </div>

        <Card className="p-6">
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

function loginDestination(state: unknown, user: Parameters<typeof defaultPathForUser>[0]): string {
  if (
    state &&
    typeof state === "object" &&
    "from" in state &&
    state.from &&
    typeof state.from === "object" &&
    "pathname" in state.from &&
    typeof state.from.pathname === "string" &&
    state.from.pathname !== "/login"
  ) {
    const search = "search" in state.from && typeof state.from.search === "string" ? state.from.search : "";
    const hash = "hash" in state.from && typeof state.from.hash === "string" ? state.from.hash : "";
    return `${state.from.pathname}${search}${hash}`;
  }
  return defaultPathForUser(user);
}

function authErrorMessage(_code: string | null): string | null {
  return null;
}
