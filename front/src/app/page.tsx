import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
          Eldercare Fall AI
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          시설 운영자를 위한 실시간 낙상 NOC 대시보드
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
          카카오 계정으로 시설을 등록하고, 본인 시설 컨텍스트에서만 대상자 상태와 알림을 확인합니다.
          인증과 테넌트 경계는 백엔드가 소유합니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-full bg-cyan-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            카카오로 시작하기
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-white/20 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            대시보드 열기
          </Link>
        </div>
      </section>
    </main>
  );
}
