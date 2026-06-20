import { Footprints } from "lucide-react";

/** 추천 순찰 순서 — "어디부터 가야 하지?"를 고민하지 않게 한다. */
export function PatrolOrderPanel({ order, allStable }: { order: string[]; allStable: boolean }) {
  return (
    <section className="rounded-2xl border-2 border-brand/30 bg-brand-soft p-4">
      <h2 className="mb-2 flex items-center gap-2 text-2xl font-extrabold text-ink 2xl:text-3xl">
        <Footprints className="h-7 w-7 text-brand" />
        추천 순찰 순서
      </h2>
      {allStable && (
        <p className="mb-2 text-lg text-ink-soft">현재는 일반 순찰만 하시면 됩니다.</p>
      )}
      <ol className="space-y-2">
        {order.map((name, i) => (
          <li key={name + i} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-extrabold text-white">
              {i + 1}
            </span>
            <span className="text-2xl font-bold text-ink 2xl:text-3xl">{name}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
