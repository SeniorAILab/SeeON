export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <form action="/orgs" method="post" className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl">
        <p className="text-sm font-semibold text-cyan-700">첫 시설 등록</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">시설 정보를 입력하세요</h1>
        <p className="mt-4 leading-7 text-slate-600">
          첫 가입자는 시설 owner로 등록됩니다. 시설명은 필수이고 사업자번호는 MVP에서 선택값입니다.
        </p>
        <label className="mt-8 block text-sm font-semibold text-slate-800" htmlFor="facilityName">
          시설명
        </label>
        <input
          id="facilityName"
          name="facilityName"
          required
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
          placeholder="예: 행복 요양원"
        />
        <label className="mt-5 block text-sm font-semibold text-slate-800" htmlFor="businessRegistrationNumber">
          사업자번호(선택)
        </label>
        <input
          id="businessRegistrationNumber"
          name="businessRegistrationNumber"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
          placeholder="000-00-00000"
        />
        <button
          type="submit"
          className="mt-8 w-full rounded-2xl bg-slate-950 px-5 py-4 font-bold text-white transition hover:bg-slate-800"
        >
          시설 생성하기
        </button>
      </form>
    </main>
  );
}
