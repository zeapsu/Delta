import { formatCents } from "@/lib/format";
import { getNetWorthData } from "@/lib/networth-data";
import type { NetWorthRow } from "@/lib/networth";

export const dynamic = "force-dynamic";

export default async function NetWorthPage() {
  const { total: rows } = await getNetWorthData();

  const latest = rows.at(-1)?.net_worth ?? null;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold">Net worth</h1>

        <div>
          <span className="text-sm opacity-60">Current net worth</span>
          <p className="text-2xl font-semibold">{formatCents(latest)}</p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm opacity-60">Sync to start tracking net worth.</p>
        ) : rows.length === 1 ? null : (
          <NetWorthChart rows={rows} />
        )}
      </main>
    </div>
  );
}

function NetWorthChart({ rows }: { rows: NetWorthRow[] }) {
  const width = 600;
  const height = 220;
  const padX = 40;
  const padY = 20;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;

  const values = rows.map((r) => r.net_worth);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const points = rows.map((r, i) => {
    const x = padX + (i / (rows.length - 1)) * innerWidth;
    const y = padY + innerHeight - ((r.net_worth - min) / (max - min)) * innerHeight;
    return { x, y };
  });

  const lastPoint = points.at(-1)!;
  const mid = (min + max) / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill="currentColor" />
      <text x={4} y={padY + 4} fontSize={11} opacity={0.6}>
        {formatCents(max)}
      </text>
      <text x={4} y={height / 2 + 4} fontSize={11} opacity={0.6}>
        {formatCents(mid)}
      </text>
      <text x={4} y={height - padY + 4} fontSize={11} opacity={0.6}>
        {formatCents(min)}
      </text>
      <text x={padX} y={height - 4} fontSize={11} opacity={0.6}>
        {rows[0].day}
      </text>
      <text x={width - padX} y={height - 4} fontSize={11} opacity={0.6} textAnchor="end">
        {rows.at(-1)!.day}
      </text>
    </svg>
  );
}
