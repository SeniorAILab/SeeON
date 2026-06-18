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
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              운영 설정
            </p>
            <h1 className="mt-1 text-2xl font-bold">설정</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          {settingCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-slate-950/20 transition hover:border-cyan-400/50 hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">{card.title}</h2>
                  <p className="mt-2 text-sm text-slate-400">{card.description}</p>
                </div>
                <span className="text-2xl text-cyan-300">›</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
