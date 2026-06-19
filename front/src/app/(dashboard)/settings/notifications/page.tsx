import Link from "next/link";

import { isServerDemo } from "../../../../lib/config";

export default function NotificationsSettingsPage() {
  // ponytail: no /api/kakao-status or policy endpoint exists; Kakao status
  // is demo-only chrome; policy scalars are product defaults, not live config.
  const demo = isServerDemo();

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">설정</p>
            <h1 className="mt-1 text-2xl font-bold text-balance text-ink">알림</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            ← 대시보드
          </Link>
        </div>

        <div className="mb-3">
          <h2 className="text-base font-bold text-ink">알림 설정 현황</h2>
          <p className="mt-0.5 text-xs text-muted">카카오 발송·템플릿·쿨다운 정책</p>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <p className="text-sm font-medium text-muted">카카오 발송 상태</p>
            {demo ? (
              <>
                <p className="mt-3 text-2xl font-bold text-ok">연결됨</p>
                <p className="mt-2 text-sm text-pretty text-muted">
                  보호자 안내 채널이 정상적으로 준비되어 있습니다.
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-2xl font-bold text-ink-2">(미설정)</p>
                <p className="mt-2 text-sm text-pretty text-muted">
                  카카오 발송 채널이 아직 연결되지 않았습니다.
                </p>
              </>
            )}
          </article>

          <article className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <p className="text-sm font-medium text-muted">야간 무음 시간</p>
            <p className="mt-3 text-2xl font-bold tabular-nums text-ink">22:00 ~ 06:00</p>
            <p className="mt-2 text-sm text-pretty text-muted">
              긴급 알림은 즉시 표시하고 일반 안내는 다음 근무 시간에 묶어 전달합니다.{" "}
              <span className="text-xs text-muted">(기본값)</span>
            </p>
          </article>

          <article className="rounded-card border border-line bg-surface p-5 shadow-sm md:col-span-2">
            <p className="text-sm font-medium text-muted">알림 템플릿 미리보기</p>
            <div className="mt-4 rounded-xl border border-line bg-surface-2 p-5">
              <p className="text-sm font-medium text-brand">보호자 안내</p>
              <p className="mt-3 text-lg font-bold text-balance text-ink">
                김영자 어르신의 침대 이탈 가능성이 감지되어 담당자가 확인 중입니다.
              </p>
              <p className="mt-2 text-sm text-pretty text-muted">
                확인 결과는 기관 담당자를 통해 안내됩니다.
              </p>
            </div>
          </article>

          <article className="rounded-card border border-line bg-surface p-5 shadow-sm md:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted">재발송 쿨다운</p>
                <p className="mt-3 text-2xl font-bold tabular-nums text-ink">15분</p>
                <p className="mt-2 text-sm text-pretty text-muted">
                  동일 입소자·동일 유형 알림은 설정 시간 안에 반복 발송하지 않습니다.{" "}
                  <span className="text-xs text-muted">(기본값)</span>
                </p>
              </div>
              <button
                type="button"
                disabled
                className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted"
              >
                변경 비활성화
              </button>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
