import { redirect } from "next/navigation";
import { getFrontSession } from "../../lib/session";

export default async function DashboardPage() {
  const session = await getFrontSession();
  if (!session) redirect("/login");
  if (!session.user.orgId) redirect("/onboarding");

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">NOC Dashboard</p>
        <h1 className="mt-3 text-4xl font-bold">시설 실시간 모니터링</h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          백엔드 /auth/session 검증을 통과한 시설 세션만 이 화면을 렌더링합니다. 실제 대상자 상태,
          SSE 피드, 이력/관리 화면은 이후 G003/G004에서 이 표면 위에 연결됩니다.
        </p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-slate-400">현재 세션</p>
          <p className="mt-2 font-mono text-cyan-100">orgId: {session.user.orgId}</p>
        </div>
      </section>
    </main>
  );
}
