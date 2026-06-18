import Link from "next/link";

const users = [
  { name: "한지민", role: "요양보호사", connected: true },
  { name: "오세영", role: "요양보호사", connected: true },
  { name: "문태호", role: "원장", connected: true },
  { name: "서민재", role: "관리자", connected: false },
];

export default function UsersSettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              설정
            </p>
            <h1 className="mt-1 text-2xl font-bold">사용자</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/20">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-400">기관 구성원 권한과 연결 상태</p>
            <button
              type="button"
              disabled
              className="rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-bold text-cyan-200 opacity-60"
            >
              초대
            </button>
          </div>

          <div className="space-y-3">
            {users.map((user) => (
              <article
                key={user.name}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900/60 p-4"
              >
                <div>
                  <p className="font-bold text-white">{user.name}</p>
                  <p className="mt-1 text-sm text-slate-400">{user.role}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      user.connected
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    Kakao {user.connected ? "연결됨" : "대기 중"}
                  </span>
                  <button
                    type="button"
                    disabled
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-500"
                  >
                    비활성화
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
