"use client";

import { FormEvent, useState } from "react";

export default function OnboardingPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        facilityName: form.get("facilityName"),
        businessRegistrationNumber: form.get("businessRegistrationNumber"),
      }),
    });
    setSubmitting(false);
    if (!response.ok) {
      setError("시설 생성에 실패했습니다. 입력값과 세션을 확인하세요.");
      return;
    }
    window.location.assign("/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <form onSubmit={submit} className="w-full max-w-lg rounded-card border border-line bg-surface p-8 shadow-sm">
        <p className="text-sm font-semibold text-brand">첫 시설 등록</p>
        <h1 className="mt-2 text-3xl font-bold text-balance text-ink">시설 정보를 입력하세요</h1>
        <p className="mt-4 leading-7 text-pretty text-muted">
          첫 가입자는 시설 owner로 등록됩니다. 시설명은 필수이고 사업자번호는 MVP에서 선택값입니다.
        </p>
        <label className="mt-8 block text-sm font-semibold text-ink" htmlFor="facilityName">
          시설명
        </label>
        <input
          id="facilityName"
          name="facilityName"
          required
          className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-weak"
          placeholder="예: 행복 요양원"
        />
        <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="businessRegistrationNumber">
          사업자번호(선택)
        </label>
        <input
          id="businessRegistrationNumber"
          name="businessRegistrationNumber"
          className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-weak"
          placeholder="000-00-00000"
        />
        {error ? <p className="mt-5 rounded-xl bg-danger-weak p-3 text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="mt-8 w-full rounded-xl bg-brand px-5 py-4 font-bold text-white transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "생성 중..." : "시설 생성하기"}
        </button>
      </form>
    </main>
  );
}
