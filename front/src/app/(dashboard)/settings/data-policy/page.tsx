import Link from "next/link";

const policies = [
  {
    title: "포즈 데이터 보관 기간",
    value: "30일",
    description: "개인을 식별하기 어려운 관절 좌표만 품질 점검 목적으로 제한 보관합니다.",
  },
  {
    title: "알림/이벤트 보관 기간",
    value: "1년",
    description: "돌봄 기록 확인과 기관 감사 대응에 필요한 범위만 유지합니다.",
  },
  {
    title: "내보내기/삭제 정책",
    value: "요청 승인 후 처리",
    description: "권한 확인 뒤 필요한 기록을 제공하고, 삭제 요청은 법정 보존 의무를 제외하고 반영합니다.",
  },
];

export default function DataPolicySettingsPage() {
  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">설정</p>
            <h1 className="mt-1 text-2xl font-bold text-balance text-ink">데이터 정책</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="mb-5 rounded-card border border-line bg-brand-weak p-8 shadow-sm">
          <p className="text-sm font-medium text-brand">개인정보 보호 원칙</p>
          <h2 className="mt-3 text-4xl font-black text-balance text-ink">
            영상·이미지 저장 안 함
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-pretty text-ink-2">
            현장 영상은 실시간 분석에만 사용하고 저장하지 않습니다. 보호자와 기관은 필요한
            돌봄 신호만 확인하며, 민감한 생활 영상이 남지 않도록 설계했습니다.
          </p>
        </section>

        <div className="mb-3">
          <h2 className="text-base font-bold text-ink">보관 기간 · 처리 정책</h2>
          <p className="mt-0.5 text-xs text-muted">포즈·알림 데이터 보관 원칙 및 삭제 정책</p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {policies.map((policy) => (
            <article
              key={policy.title}
              className="rounded-card border border-line bg-surface p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-muted">{policy.title}</p>
              <p className="mt-3 text-2xl font-bold text-ink">{policy.value}</p>
              <p className="mt-3 text-sm leading-6 text-pretty text-muted">
                {policy.description}
              </p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
