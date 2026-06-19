import Link from "next/link";

import { isServerDemo } from "../../../../lib/config";
import { getFrontSession } from "../../../../lib/session";

// ponytail: no /api/users endpoint exists; demo shows fixture members, production shows the logged-in user only.
const DEMO_USERS = [
  { name: "한지민", role: "요양보호사", connected: true },
  { name: "오세영", role: "요양보호사", connected: true },
  { name: "문태호", role: "원장", connected: true },
  { name: "서민재", role: "관리자", connected: false },
];

export default async function UsersSettingsPage() {
  const demo = isServerDemo();
  const session = demo ? null : await getFrontSession();

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">설정</p>
            <h1 className="mt-1 text-2xl font-bold text-balance text-ink">사용자</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-ink">기관 구성원</h2>
              <p className="mt-0.5 text-xs text-muted">권한과 Kakao 연결 상태</p>
            </div>
            <button
              type="button"
              disabled
              className="rounded-xl bg-brand-weak px-4 py-2 text-sm font-bold text-brand opacity-60"
            >
              초대
            </button>
          </div>

          {demo ? (
            <div className="space-y-3">
              {DEMO_USERS.map((user) => (
                <article
                  key={user.name}
                  className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 p-4"
                >
                  <div>
                    <p className="font-bold text-ink">{user.name}</p>
                    <p className="mt-1 text-sm text-muted">{user.role}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        user.connected
                          ? "bg-ok-weak text-ok"
                          : "border border-line bg-surface text-ink-2"
                      }`}
                    >
                      Kakao {user.connected ? "연결됨" : "대기 중"}
                    </span>
                    <button
                      type="button"
                      disabled
                      className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted"
                    >
                      비활성화
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {session?.user && (
                <article className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 p-4">
                  <div>
                    <p className="font-bold text-ink">
                      {session.user.nickname ?? session.user.id}
                    </p>
                    {session.user.role && (
                      <p className="mt-1 text-sm text-muted">{session.user.role}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled
                      className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted"
                    >
                      비활성화
                    </button>
                  </div>
                </article>
              )}
              <p className="mt-3 text-xs text-muted">다중 사용자 관리는 준비 중입니다.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
