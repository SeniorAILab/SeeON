import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { SignupConsentFields } from "@/components/SignupConsentFields";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { defaultPathForUser } from "@/lib/routeAccess";
import {
  getSignupPasswordConfirmError,
  getSignupPasswordError,
  SIGNUP_PASSWORD_MAX_LENGTH,
  SIGNUP_PASSWORD_MIN_LENGTH,
} from "@/lib/signupPassword";
import { useFacilityStore } from "@/stores/facilityStore";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorMessage } from "@/services/apiClient";

export function SignupPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const loading = useAuthStore((s) => s.loading);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordConfirmTouched, setPasswordConfirmTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  useEffect(() => {
    useAuthStore.setState({ error: null });
  }, []);

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    useAuthStore.setState({ error: null });
    setSubmitError(null);
    setSubmitted(true);
    if (!canSubmit || passwordError || passwordConfirmError) return;
    try {
      const user = await register({
        name,
        email,
        password,
        phone,
        facilityName,
      });
      resolveForUser(user.facilityId);
      navigate(defaultPathForUser(user), { replace: true });
    } catch (caught) {
      setSubmitError(apiErrorMessage(caught, "회원가입에 실패했습니다. 다시 시도해 주세요."));
    }
  }

  const canSubmit = Boolean(
    name.trim() &&
      phone.trim() &&
      facilityName.trim() &&
      email.trim() &&
      password &&
      passwordConfirm &&
      termsAgreed &&
      privacyAgreed
  );
  const passwordError = getSignupPasswordError(password);
  const passwordConfirmError = getSignupPasswordConfirmError(password, passwordConfirm);
  const showPasswordError = Boolean(passwordError && (passwordTouched || submitted));
  const showPasswordConfirmError = Boolean(
    passwordConfirmError && (passwordConfirmTouched || submitted),
  );
  const passwordHelpId = "signup-password-help";
  const passwordErrorId = "signup-password-error";
  const passwordConfirmErrorId = "signup-password-confirm-error";
  const passwordDescriptionId = showPasswordError
    ? passwordErrorId
    : passwordHelpId;
  const passwordConfirmDescriptionId = showPasswordConfirmError
    ? passwordConfirmErrorId
    : undefined;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-3" />
          <h1 className="text-xl font-bold text-ink">Senior AI Lab</h1>
          <p className="mt-1 text-sm text-ink-soft">요양원 안전 확인 시스템</p>
        </div>

        <Card className="p-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 mb-4"
            onClick={() => navigate("/login")}
          >
            <ArrowLeft className="h-4 w-4" />
            로그인으로
          </Button>

          <div className="mb-5">
            <h2 className="text-lg font-bold text-ink">회원가입</h2>
            <p className="mt-1 text-sm text-ink-soft">관리자 계정을 생성합니다.</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <Field label="이름">
              <Input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="이름"
                placeholder="홍길동"
                autoComplete="name"
                required
              />
            </Field>

            <Field label="전화번호">
              <Input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-label="전화번호"
                placeholder="010-1234-5678"
                autoComplete="tel"
                required
              />
            </Field>

            <Field label="요양원">
              <Input
                type="text"
                value={facilityName}
                onChange={(event) => setFacilityName(event.target.value)}
                aria-label="요양원"
                placeholder="늘봄 요양원"
                autoComplete="organization"
                required
              />
            </Field>

            <Field label="이메일">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="이메일"
                placeholder="name@facility.com"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="비밀번호">
              <div className="relative">
                <Input
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => setPasswordTouched(true)}
                  aria-label="비밀번호"
                  aria-describedby={passwordDescriptionId}
                  aria-invalid={showPasswordError}
                  placeholder="8자 이상 비밀번호"
                  autoComplete="new-password"
                  minLength={SIGNUP_PASSWORD_MIN_LENGTH}
                  maxLength={SIGNUP_PASSWORD_MAX_LENGTH}
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
                  title={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {showPasswordError ? (
                <p id={passwordErrorId} className="mt-1 text-xs text-status-danger">
                  {passwordError}
                </p>
              ) : (
                <p id={passwordHelpId} className="mt-1 text-xs text-ink-faint">
                  문장처럼 길고 기억하기 쉬운 비밀번호를 사용하세요.
                </p>
              )}
            </Field>

            <Field label="비밀번호 확인">
              <Input
                type={passwordVisible ? "text" : "password"}
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                onBlur={() => setPasswordConfirmTouched(true)}
                aria-label="비밀번호 확인"
                aria-describedby={passwordConfirmDescriptionId}
                aria-invalid={showPasswordConfirmError}
                placeholder="비밀번호 다시 입력"
                autoComplete="new-password"
                minLength={SIGNUP_PASSWORD_MIN_LENGTH}
                maxLength={SIGNUP_PASSWORD_MAX_LENGTH}
                required
              />
              {showPasswordConfirmError ? (
                <p
                  id={passwordConfirmErrorId}
                  className="mt-1 text-xs text-status-danger"
                >
                  {passwordConfirmError}
                </p>
              ) : null}
            </Field>

            <SignupConsentFields
              termsAgreed={termsAgreed}
              privacyAgreed={privacyAgreed}
              onTermsAgreedChange={setTermsAgreed}
              onPrivacyAgreedChange={setPrivacyAgreed}
            />
            <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
              {loading ? "가입 중..." : "회원가입"}
            </Button>
          </form>

          {submitError && (
            <div className="mt-4">
              <p className="rounded-lg bg-status-dangerBg px-3 py-2 text-sm text-status-danger">
                {submitError}
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
