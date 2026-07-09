"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import { formatCents } from "@/lib/format";

// Axis ticks: whole dollars, compact (1.2K etc.) — full cents live in tooltips.
function axisCents(v: number): string {
  return "$" + (v / 100).toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

type TooltipRow = { name: string; value: number; color?: string };

// Custom tooltip: recharts' default inline styles fight dark mode.
function ChartTooltip({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {title ? <p className="mb-1 font-medium">{title}</p> : null}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-1.5">
          {r.color ? (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: r.color }}
            />
          ) : null}
          <span className="opacity-60">{r.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">
            {formatCents(r.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export type DonutSlice = { name: string; value: number; color: string };

export function CategoryDonut({ data }: { data: DonutSlice[] }) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              // per-slice color rides the data entry's `fill` (Cell is deprecated)
              data={data.map((d) => ({ ...d, fill: d.color }))}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              // 2px surface gap between segments, not a border
              stroke="var(--background)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    rows={payload.map((p) => ({
                      name: String(p.name),
                      value: Number(p.value),
                      color: (p.payload as DonutSlice).color,
                    }))}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: d.color }}
            />
            <span>{d.name}</span>
            <span className="ml-auto pl-4 tabular-nums opacity-60">
              {formatCents(d.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type NetWorthPoint = { day: string } & Record<string, number | string | null>;
export type NetWorthSeriesDef = { key: string; name: string; color: string };

export function NetWorthLine({
  data,
  series,
}: {
  data: NetWorthPoint[];
  series: NetWorthSeriesDef[]; // excludes the bold "total" line
}) {
  return (
    <div>
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              interval="preserveStartEnd"
              minTickGap={48}
            />
            <YAxis
              tickFormatter={axisCents}
              tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    title={String(label)}
                    rows={payload
                      .filter((p) => p.value != null)
                      .map((p) => ({
                        name: String(p.name),
                        value: Number(p.value),
                        color: p.stroke as string,
                      }))}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            <Line
              dataKey="total"
              name="Net worth"
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {series.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-current" />
            <span>Net worth</span>
          </li>
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: s.color }}
              />
              <span className="opacity-60">{s.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type BudgetTrendPoint = { month: string; spent: number };

export function BudgetTrendChart({
  data,
  budget,
}: {
  data: BudgetTrendPoint[];
  budget: number;
}) {
  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
          />
          <YAxis hide domain={[0, (max: number) => Math.max(max, budget) * 1.1]} />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    { name: "Spent", value: Number(payload[0].value) },
                    { name: "Budget", value: budget },
                  ]}
                />
              ) : null
            }
          />
          <ReferenceLine
            y={budget}
            stroke="var(--chart-muted)"
            strokeDasharray="4 3"
          />
          <Bar
            dataKey="spent"
            name="Spent"
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            // status red for over-budget months, matching the progress bars
            // (shape prop replaces the deprecated Cell)
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                fill={
                  data[props.index ?? 0]?.spent > budget
                    ? "#dc2626"
                    : "var(--chart-1)"
                }
              />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
