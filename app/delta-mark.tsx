import { useId } from "react";

// Delta's glass Δ, the same art as app/icon.svg. Dark glass on light, white
// glass on dark: the --mark-* tokens in globals.css switch it with the theme.
const D =
  "M712.1 268.9L1012.9 855.8A99 99 0 0 1 924.8 1000L323.2 1000A99 99 0 0 1 235.1 855.8L535.9 268.9A99 99 0 0 1 712.1 268.9Z" +
  "M616.9 474.9L439.8 820.4A8 8 0 0 0 447 832L801 832A8 8 0 0 0 808.2 820.4L631.1 474.9A8 8 0 0 0 616.9 474.9Z";

export function DeltaMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="197 177 860 860" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0.1" x2="0.35" y2="1">
          <stop offset="0" style={{ stopColor: "var(--mark-top)" }} />
          <stop offset="1" style={{ stopColor: "var(--mark-bottom)" }} />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}n`} cx="820" cy="850" r="230" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7cf08a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#7cf08a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={D} fill={`url(#${id}g)`} fillRule="evenodd" />
      <path d={D} fill={`url(#${id}s)`} fillRule="evenodd" />
      <path d={D} fill={`url(#${id}n)`} fillRule="evenodd" />
      <path d={D} fill="none" stroke="#000" strokeWidth="14" style={{ strokeOpacity: "var(--mark-edge)" }} />
      <path d={D} fill="none" stroke="#fff" strokeWidth="9" style={{ strokeOpacity: "var(--mark-rim)" }} />
    </svg>
  );
}
