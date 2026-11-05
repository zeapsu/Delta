import { CopyButton } from "../copy-button";
import { Steps } from "../ui";

// Tailscale's address range (100.64.0.0/10) or a MagicDNS name.
export function onTailnet(url: string | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  const m = host.match(/^100\.(\d{1,3})\./);
  return (m !== null && Number(m[1]) >= 64 && Number(m[1]) <= 127) || host.endsWith(".ts.net");
}

// Settings → Use on your phone. Terminal installs start on this computer only
// (127.0.0.1); `./delta.sh phone` (Homebrew: `delta phone`) moves Delta onto
// the Tailscale address.
export function PhoneAccess({ url, brew }: { url: string | undefined; brew?: boolean }) {
  const command = brew ? "delta phone" : "./delta.sh phone";
  if (url && onTailnet(url)) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-sm">
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          On your tailnet at <code className="font-mono text-xs">{url}</code>
        </span>
        <CopyButton text={url} label="Copy address" />
      </div>
    );
  }
  return (
    <Steps
      steps={[
        {
          title: "Install Tailscale here and on your phone",
          state: "todo",
          action: (
            <a className="btn btn-sm" href="https://tailscale.com/download" target="_blank" rel="noreferrer">
              Download <span aria-hidden>↗</span>
            </a>
          ),
        },
        { title: "Sign in on both with the same account", state: "todo" },
        {
          title: brew ? "Run this in a terminal" : "Run this in your Delta folder",
          state: "todo",
          action: <CopyButton text={command} label="Copy command" />,
          detail: (
            <>
              <code className="font-mono">{command}</code>, then open the address it prints on your phone.
            </>
          ),
        },
      ]}
    />
  );
}
