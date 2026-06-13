export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">NOC Dashboard</p>
        <h1 className="mt-3 text-4xl font-bold">시설 실시간 모니터링</h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          G002는 인증·세션·테넌트 가드 기반을 세웁니다. 실제 대상자 상태, SSE 피드, 이력/관리 화면은
          이후 G003/G004에서 이 표면 위에 연결됩니다.
        </p>
      </section>
    </main>
  );
}
