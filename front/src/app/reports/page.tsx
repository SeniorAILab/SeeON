"use client";

import { useState } from "react";
import Link from "next/link";

import { RESIDENTS } from "../../lib/mock/fixtures";

const periods = ["7일", "30일", "90일"];

const repeatedEvents = RESIDENTS.slice(0, 4).map((resident, index) => ({
  name: resident.name,
  room: resident.room,
  count: [9, 7, 5, 4][index],
}));

const statCards = [
  {
    title: "낙상 의심 추이",
    value: "12건",
    caption: "최근 주간 기준 전주 대비 18% 감소",
    bars: [35, 52, 40, 64, 46, 30, 24],
    tone: "bg-red-400",
  },
  {
    title: "침대 이탈 추이",
    value: "28건",
    caption: "취침 후 2시간 이내 집중 발생",
    bars: [42, 58, 55, 48, 62, 70, 64],
    tone: "bg-amber-300",
  },
  {
    title: "미확인 알림 추이",
    value: "3건",
    caption: "운영 기준 이내로 관리 중",
    bars: [22, 18, 30, 14, 10, 16, 8],
    tone: "bg-cyan-300",
  },
  {
    title: "평균 확인 시간",
    value: "1분 42초",
    caption: "주간 목표 3분 대비 안정권",
    bars: [68, 58, 54, 48, 44, 38, 32],
    tone: "bg-emerald-300",
  },
  {
    title: "야간 시간대 분포",
    value: "62%",
    caption: "22시~06시 이벤트 비중",
    bars: [26, 30, 48, 76, 82, 68, 36],
    tone: "bg-violet-300",
  },
  {
    title: "입소자별 반복 이벤트 순위",
    value: `${repeatedEvents[0].name} ${repeatedEvents[0].count}건`,
    caption: "상위 4명 집중 관찰 필요",
    ranking: repeatedEvents,
    tone: "bg-cyan-300",
  },
  {
    title: "카메라 오프라인 시간",
    value: "46분",
    caption: "전체 장치 합산, 월간 목표 2시간 이하",
    bars: [8, 18, 10, 30, 46, 22, 14],
    tone: "bg-slate-300",
  },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState(periods[0]);
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              운영 리포트
            </p>
            <h1 className="mt-1 text-2xl font-bold">리포트</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="inline-flex rounded-xl border border-white/10 bg-slate-900/80 p-1">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  period === p
                    ? "bg-cyan-400 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-400">
            최근 {period} 기준 핵심 지표입니다.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {statCards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/20"
            >
              <p className="text-sm font-semibold text-slate-300">{card.title}</p>
              <p className="mt-3 text-3xl font-bold text-white">{card.value}</p>
              <p className="mt-2 text-sm text-slate-400">{card.caption}</p>
              {"bars" in card && (
                <div className="mt-5 flex h-24 items-end gap-2">
                  {card.bars?.map((height, index) => (
                    <div
                      key={`${card.title}-${index}`}
                      className="flex flex-1 items-end rounded-full bg-white/5"
                    >
                      <div
                        className={`w-full rounded-full ${card.tone}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>
              )}
              {"ranking" in card && (
                <div className="mt-5 space-y-3">
                  {card.ranking?.map((item, index) => (
                    <div key={item.name}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {index + 1}. {item.name} · {item.room}호
                        </span>
                        <span>{item.count}건</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full bg-cyan-300"
                          style={{ width: `${(item.count / 9) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
