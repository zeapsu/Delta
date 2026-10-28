"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
  return (v < 0 ? "-$" : "$") + (Math.abs(v) / 100).toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

const TICK = { fontSize: 11, fill: "var(--chart-muted)" };
// Hover cursor band for bar charts.
const BAR_CURSOR = { fill: "var(--chart-grid)", opacity: 0.5 };

type TooltipRow = { name: string; value: number; color?: string };

// Custom tooltip: a small glass panel (recharts' default inline styles fight
// dark mode). Text stays in ink; the swatch carries series identity.
function ChartTooltip({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs">
      {title ? <p className="mb-1 font-medium">{title}</p> : null}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-1.5">
          {r.color ? (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: r.color }}
            />
          ) : null}
          <span className="text-muted">{r.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">
            {formatCents(r.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { name: string; color: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span
            className={s.line ? "inline-block h-0.5 w-4 rounded" : "inline-block h-2.5 w-2.5 rounded-sm"}
            style={{ background: s.color }}
          />
          <span className="text-muted">{s.name}</span>
        </li>
      ))}
    </ul>
  );
}

export type DonutSlice = { name: string; value: number; color: string };

export function CategoryDonut({ data, total }: { data: DonutSlice[]; total: number }) {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              // per-slice color rides the data entry's `fill` (Cell is deprecated)
              data={data.map((d) => ({ ...d, fill: d.color }))}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              cornerRadius={4}
              paddingAngle={1.5}
              // 2px surface gap between segments, not a border
              stroke="var(--surface-solid)"
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
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="eyebrow">Total</span>
          <span className="text-lg font-semibold tabular-nums">{formatCents(total)}</span>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-1.5 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: d.color }}
            />
            <span className="truncate">{d.name}</span>
            <span className="ml-auto pl-4 tabular-nums text-muted">
              {total > 0 ? `${Math.round((d.value / total) * 100)}%` : ""}
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums">{formatCents(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type TrendPoint = { label: string; value: number };

// Compact hoverable area trend (home hero). Single series: no legend; the
// card title names it.
export function TrendArea({
  data,
  height = 120,
  color = "var(--chart-ink)",
}: {
  data: TrendPoint[];
  height?: number;
  color?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--chart-muted)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={String(label)}
                  rows={[{ name: "Net worth", value: Number(payload[0].value) }]}
                />
              ) : null
            }
          />
          <Area
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#g${id})`}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface-solid)", strokeWidth: 2, fill: color }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
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
  const id = useId().replace(/:/g, "");
  return (
    <div className="flex flex-col gap-3">
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={`nw${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-ink)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--chart-ink)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="day"
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              interval="preserveStartEnd"
              minTickGap={48}
            />
            <YAxis
              tickFormatter={axisCents}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-muted)", strokeDasharray: "3 3" }}
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
              <Area
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={1.5}
                fill="none"
                dot={false}
                activeDot={{ r: 4, stroke: "var(--surface-solid)", strokeWidth: 2, fill: s.color }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            <Area
              dataKey="total"
              name="Net worth"
              stroke="var(--chart-ink)"
              strokeWidth={2.5}
              fill={`url(#nw${id})`}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface-solid)", strokeWidth: 2, fill: "var(--chart-ink)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {series.length > 0 ? (
        <Legend
          items={[
            { name: "Net worth", color: "var(--chart-ink)", line: true },
            ...series.map((s) => ({ name: s.name, color: s.color, line: true })),
          ]}
        />
      ) : null}
    </div>
  );
}

export type CashFlowPoint = { label: string; income: number; spending: number };

// Income vs spending per month: green in, red out (also separated by
// lightness for red-green CVD), always with a legend.
export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2}>
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
            <YAxis tickFormatter={axisCents} tick={TICK} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              cursor={BAR_CURSOR}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as CashFlowPoint;
                return (
                  <ChartTooltip
                    title={String(label)}
                    rows={[
                      { name: "Income", value: p.income, color: "var(--chart-in)" },
                      { name: "Spending", value: p.spending, color: "var(--chart-out)" },
                      { name: "Net", value: p.income - p.spending },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="income" name="Income" fill="var(--chart-in)" maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="spending" name="Spending" fill="var(--chart-out)" maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { name: "Income", color: "var(--chart-in)" },
          { name: "Spending", color: "var(--chart-out)" },
        ]}
      />
    </div>
  );
}

export type MonthBar = { label: string; value: number; current?: boolean };

// Single-series monthly totals; the selected month is ink, the rest recede.
export function MonthBars({ data, height = 160 }: { data: MonthBar[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
          <YAxis hide />
          <Tooltip
            cursor={BAR_CURSOR}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip title={String(label)} rows={[{ name: "Spent", value: Number(payload[0].value) }]} />
              ) : null
            }
          />
          <Bar
            dataKey="value"
            maxBarSize={28}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                fill={data[props.index ?? 0]?.current ? "var(--chart-ink)" : "var(--chart-ink-2)"}
              />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
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
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="month"
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
          />
          <YAxis hide domain={[0, (max: number) => Math.max(max, budget) * 1.1]} />
          <Tooltip
            cursor={BAR_CURSOR}
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
            // status green/red for under/over-budget months, matching the progress bars
            // (shape prop replaces the deprecated Cell)
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                fill={
                  data[props.index ?? 0]?.spent > budget
                    ? "var(--negative)"
                    : "var(--chart-in)"
                }
              />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
