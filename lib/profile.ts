// Who's using Delta and where: the name in the greeting and the time zone
// every date uses (today, this month, the greeting). Stored as the "profile"
// row of `settings`; pure parsing here, DB side in lib/settings.ts.

export type Profile = { name: string | null; timeZone: string | null };
export const PROFILE_KEY = "profile";

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Body of PUT /api/settings/profile. Both keys optional; an empty name clears it.
export function parseProfileInput(v: unknown): { ok: true; value: Partial<Profile> } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "Invalid body" };
  const { name, timeZone } = v as Record<string, unknown>;
  const out: Partial<Profile> = {};
  if (name !== undefined) {
    if (typeof name !== "string") return { ok: false, error: "Name must be text" };
    const n = name.trim();
    if (n.length > 40) return { ok: false, error: "Name must be 40 characters or fewer" };
    out.name = n || null;
  }
  if (timeZone !== undefined) {
    if (!validTimeZone(timeZone)) return { ok: false, error: "Unknown time zone" };
    out.timeZone = timeZone;
  }
  return { ok: true, value: out };
}

export function parseStoredProfile(json: string | undefined): Profile | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return {
      name: typeof v?.name === "string" && v.name ? v.name : null,
      timeZone: validTimeZone(v?.timeZone) ? v.timeZone : null,
    };
  } catch {
    return null;
  }
}

export function greeting(hour: number, name: string | null): string {
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return name ? `Good ${part}, ${name}` : `Good ${part}`;
}
