"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "../../lib/dashboard-metrics";

// ponytail: warm palette as literals — Tailwind v4 tokens live in CSS, not
// readable from JS without getComputedStyle. These mirror globals.css.
const BRAND = "#F2784B";
const DANGER = "#E04848";
const LINE = "#EFE7DE";
const MUTED = "#968C82";

export function TrendArea({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.3} />
            <stop offset="92%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={LINE} vertical={false} />
        <XAxis
          dataKey="hour"
          interval={2}
          tickFormatter={(h: number) => `${h}시`}
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          width={30}
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          labelFormatter={(h) => `${h}시`}
          formatter={(v) => `${v}건`}
          contentStyle={{
            borderRadius: 12,
            border: `1px solid ${LINE}`,
            fontSize: 12,
            boxShadow: "0 10px 30px -16px rgba(40,33,28,.18)",
          }}
        />
        <Area
          type="monotone"
          dataKey="total"
          name="전체 알림"
          stroke={BRAND}
          strokeWidth={2.4}
          fill="url(#trendTotal)"
        />
        <Area
          type="monotone"
          dataKey="fall"
          name="낙상 감지"
          stroke={DANGER}
          strokeWidth={2}
          fillOpacity={0}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
