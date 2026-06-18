import Link from "next/link";

export default function NotificationsSettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              설정
            </p>
            <h1 className="mt-1 text-2xl font-bold">알림</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/20">
            <p className="text-sm font-semibold text-slate-400">카카오 발송 상태</p>
            <p className="mt-3 text-2xl font-bold text-emerald-300">연결됨</p>
            <p className="mt-2 text-sm text-slate-400">
              보호자 안내 채널이 정상적으로 준비되어 있습니다.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/20">
            <p className="text-sm font-semibold text-slate-400">야간 무음 시간</p>
            <p className="mt-3 text-2xl font-bold text-white">22:00 ~ 06:00</p>
            <p className="mt-2 text-sm text-slate-400">
              긴급 알림은 즉시 표시하고 일반 안내는 다음 근무 시간에 묶어 전달합니다.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/20 md:col-span-2">
            <p className="text-sm font-semibold text-slate-400">알림 템플릿 미리보기</p>
            <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-slate-900/80 p-5">
              <p className="text-sm text-cyan-200">보호자 안내</p>
              <p className="mt-3 text-lg font-bold text-white">
                김영자 어르신의 침대 이탈 가능성이 감지되어 담당자가 확인 중입니다.
              </p>
              <p className="mt-2 text-sm text-slate-400">
                확인 결과는 기관 담당자를 통해 안내됩니다.
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/20 md:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-400">재발송 쿨다운</p>
                <p className="mt-3 text-2xl font-bold text-white">15분</p>
                <p className="mt-2 text-sm text-slate-400">
                  동일 입소자·동일 유형 알림은 설정 시간 안에 반복 발송하지 않습니다.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-500"
              >
                변경 비활성화
              </button>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
