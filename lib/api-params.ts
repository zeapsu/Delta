// Query-string parsing for the /api/v1 read routes. Each parser returns the
// value or throws ParamError, which the routes turn into a 400.
import { NextResponse } from "next/server";
import { currentMonth, isMonth } from "@/lib/months";

export class ParamError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function monthParam(sp: URLSearchParams, key = "month"): string {
  const v = sp.get(key);
  if (v === null) return currentMonth();
  if (!isMonth(v)) throw new ParamError(`${key} must be YYYY-MM`);
  return v;
}

export function dateParam(sp: URLSearchParams, key: string): string | undefined {
  const v = sp.get(key);
  if (v === null) return undefined;
  if (!DATE_RE.test(v)) throw new ParamError(`${key} must be YYYY-MM-DD`);
  return v;
}

export function intParam(
  sp: URLSearchParams,
  key: string,
  { min, max, fallback }: { min: number; max: number; fallback?: number },
): number | undefined {
  const v = sp.get(key);
  if (v === null) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ParamError(`${key} must be an integer from ${min} to ${max}`);
  }
  return n;
}

// Wraps a GET handler so ParamError becomes a 400 with its message.
export function readRoute(handler: (sp: URLSearchParams) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      return NextResponse.json(await handler(new URL(req.url).searchParams));
    } catch (err) {
      if (err instanceof ParamError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  };
}
