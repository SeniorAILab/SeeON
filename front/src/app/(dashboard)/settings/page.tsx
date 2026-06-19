import Link from "next/link";

const settingCards = [
  {
    title: "장치",
    description: "카메라 연결 상태와 배정 정보를 확인합니다.",
    href: "/settings/devices",
  },
  {
    title: "사용자",
    description: "기관 구성원과 권한, Kakao 연결 상태를 관리합니다.",
    href: "/settings/users",
  },
  {
    title: "알림",
    description: "보호자 안내 문구와 발송 정책을 점검합니다.",
    href: "/settings/notifications",
  },
  {
    title: "데이터 정책",
    description: "영상 비저장 원칙과 보관 기간을 확인합니다.",
    href: "/settings/data-policy",
  },
];

export default function SettingsPage() {
  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">운영 설정</p>
            <h1 className="mt-1 text-2xl font-bold text-balance text-ink">설정</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          {settingCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-card border border-line bg-surface p-5 shadow-sm transition hover:border-brand/60 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-ink">{card.title}</h2>
                  <p className="mt-1 text-xs text-muted">{card.description}</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className="size-4 shrink-0 text-brand" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
