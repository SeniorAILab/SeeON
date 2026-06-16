export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <p className="text-sm font-semibold text-cyan-700">시설 운영자 로그인</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Kakao OAuth로 로그인</h1>
        <p className="mt-4 leading-7 text-slate-600">
          백엔드가 카카오 콜백과 httpOnly 세션 쿠키를 소유합니다. 로그인 후 조직이 없는 계정은
          시설 온보딩으로 이동합니다.
        </p>
        <a
          href="/auth/kakao/login"
          className="mt-8 flex w-full items-center justify-center rounded-2xl bg-[#FEE500] px-5 py-4 font-bold text-[#191919] transition hover:brightness-95"
        >
          카카오 계정으로 계속하기
        </a>
      </section>
    </main>
  );
}
