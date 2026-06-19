"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TypeSlice } from "../../lib/dashboard-metrics";

// ponytail: per-type warm colors as literals (mirror globals.css tokens);
// unknown types fall back to muted.
const TYPE_COLOR: Record<string, string> = {
  FALL: "#E04848",
  BED_EXIT: "#E0A11B",
  NO_MOTION: "#2E9E7B",
  DETECTION_LOST: "#968C82",
};
const FALLBACK = "#968C82";

export function TypeDonut({ data }: { data: TypeSlice[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.type} fill={TYPE_COLOR[d.type] ?? FALLBACK} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => `${v}건`}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #EFE7DE",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-ink">{total}</span>
          <span className="text-xs text-muted">총 알림</span>
        </div>
      </div>
      <ul className="mt-4 w-full space-y-2">
        {data.map((d) => (
          <li key={d.type} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2.5 flex-none rounded-sm"
              style={{ background: TYPE_COLOR[d.type] ?? FALLBACK }}
            />
            <span className="text-ink-2">{d.label}</span>
            <span className="ml-auto font-bold tabular-nums text-ink">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
