import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Card } from "@/components/ui/primitives";
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
  const kakaoLogin = useAuthStore((s) => s.kakaoLogin);
  const error = useAuthStore((s) => s.error);
  const loading = useAuthStore((s) => s.loading);
  const setTheme = useUiStore((s) => s.setTheme);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    setTheme(new Date().getHours() >= 19 || new Date().getHours() < 7 ? "dark" : "light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleKakaoLogin() {
    kakaoLogin();
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
            {loading ? "이동 중..." : "카카오 로그인"}
          </button>

          {error && (
            <div className="mt-4">
              <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">
                {error}
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
