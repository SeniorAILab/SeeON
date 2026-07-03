type SignupConsentFieldsProps = {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  onTermsAgreedChange: (agreed: boolean) => void;
  onPrivacyAgreedChange: (agreed: boolean) => void;
};

export function SignupConsentFields({
  termsAgreed,
  privacyAgreed,
  onTermsAgreedChange,
  onPrivacyAgreedChange,
}: SignupConsentFieldsProps) {
  return (
    <div className="rounded-lg border border-border bg-surface2 p-3 text-sm">
      <p className="mb-3 text-xs text-ink-faint">
        아래 항목은 계정 생성에 필요한 필수 동의입니다. 영상·얼굴 정보는 가입 정보로
        수집하지 않습니다.
      </p>
      <label className="flex cursor-pointer gap-2 text-ink">
        <input
          type="checkbox"
          checked={termsAgreed}
          onChange={(event) => onTermsAgreedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          required
        />
        <span>
          <span className="font-medium">서비스 이용약관에 동의합니다</span>
          <span className="mt-0.5 block text-xs text-ink-faint">
            MVP 서비스 이용 조건과 시설 관리자 계정 생성 기준을 확인했습니다.
          </span>
        </span>
      </label>
      <label className="mt-3 flex cursor-pointer gap-2 text-ink">
        <input
          type="checkbox"
          checked={privacyAgreed}
          onChange={(event) => onPrivacyAgreedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          required
        />
        <span>
          <span className="font-medium">개인정보 수집 및 이용에 동의합니다</span>
          <span className="mt-0.5 block text-xs text-ink-faint">
            이름, 이메일, 전화번호, 요양원명은 계정 생성과 시설 운영 연락에만 사용합니다.
          </span>
        </span>
      </label>
    </div>
  );
}
