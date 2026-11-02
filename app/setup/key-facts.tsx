// Which keys are in use, as chips: environment, client ID hint, source.
export function KeyFacts({ env, clientId, source }: { env: string; clientId: string | null; source: string }) {
  const chip = "rounded-full border border-hairline bg-fill px-2.5 py-0.5 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${chip} font-medium`}>{env === "production" ? "Production" : "Sandbox"}</span>
      <span className={`${chip} font-mono`}>{clientId ?? "no client ID"}</span>
      <span className={`${chip} text-muted`}>{source}</span>
    </div>
  );
}
