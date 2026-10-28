"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = { role: "user" | "assistant"; text: string };

// Assistant text streams, but tool-heavy advisory turns spend most of their
// time in SQL calls before the first delta — show elapsed time so it doesn't
// look hung (#46). Mounts when a turn starts, unmounts on the first text, so
// it resets itself.
function Thinking() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="animate-pulse text-sm text-muted">
      Thinking… {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
    </p>
  );
}

export function Chat({
  conversationId,
  initialMessages,
}: {
  conversationId: number | null;
  initialMessages: Msg[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [activeId, setActiveId] = useState<number | null>(conversationId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // ephemeral tool-activity line from {"t":"status"} frames — never persisted
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // set when this send created the conversation — drives the post-stream
  // router.refresh() so the server sidebar picks it up (never mid-stream)
  const createdRef = useRef(false);

  const appendToLast = (chunk: string) =>
    setMessages((m) => {
      const copy = m.slice();
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, text: last.text + chunk };
      return copy;
    });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", text: message },
      { role: "assistant", text: "" },
    ]);
    try {
      let id = activeId;
      if (id === null) {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: message.slice(0, 40) }),
        });
        if (!res.ok) throw new Error("Failed to create conversation");
        const data = await res.json();
        id = data.id;
        setActiveId(id);
        createdRef.current = true;
        // raw replaceState on purpose: a router navigation would remount the
        // keyed <Chat> and drop the in-flight stream (gotcha #40)
        window.history.replaceState(null, "", "/chat?c=" + id);
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId: id }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      // NDJSON stream: {"t":"text","v":...} appends to the reply,
      // {"t":"status","v":...} is a transient progress label (tool activity).
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!; // partial tail stays in the buffer
        for (const line of lines) {
          if (!line) continue;
          let frame: { t: string; v: string };
          try {
            frame = JSON.parse(line);
          } catch {
            continue;
          }
          if (frame.t === "text") {
            setStatus(null);
            appendToLast(frame.v);
          } else if (frame.t === "status") {
            setStatus(frame.v);
          }
        }
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      appendToLast(`\n[error: ${err instanceof Error ? err.message : String(err)}]`);
    } finally {
      setBusy(false);
      setStatus(null);
      if (createdRef.current) {
        createdRef.current = false;
        // safe post-stream: Next 16 synced the replaceState URL into router
        // state, and the route persists the reply before closing the stream,
        // so the refreshed server page renders the full transcript
        router.refresh();
      }
    }
  };

  const stop = () => {
    if (activeId === null) return;
    // route finishes the stream with "[stopped]" — the reader loop then ends
    fetch("/api/chat/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeId }),
    }).catch(() => {});
  };

  const handleDelete = () => {
    if (activeId === null) return;
    setError(null);
    setDeleting(true);
    fetch("/api/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to delete conversation");
        }
        // Can't rely on router.push remounting <Chat>: creating a conversation
        // mid-session updates the URL via history.replaceState (see send), which
        // the router doesn't see, so push("/chat") is a same-route no-op there.
        setMessages([]);
        setActiveId(null);
        window.history.replaceState(null, "", "/chat");
        router.refresh();
      })
      .catch((err) => setError(err.message))
      .finally(() => setDeleting(false));
  };

  const waiting =
    busy && messages[messages.length - 1]?.role === "assistant" &&
    messages[messages.length - 1].text === "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4 sm:px-6">
      {activeId !== null && (
        <div className="flex items-center justify-end gap-2">
          {error && <span className="text-sm text-negative">{error}</span>}
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy || deleting}
            className="btn btn-sm btn-danger"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-5 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-16 text-center">
            <span className="glass flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold">
              Δ
            </span>
            <p className="text-lg font-semibold tracking-tight">Ask Delta</p>
            <p className="max-w-sm text-sm text-muted">
              Ask about your spending, budgets, subscriptions, or net worth.
            </p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="max-w-[85%] self-end whitespace-pre-wrap rounded-3xl rounded-br-lg bg-ink px-4 py-2.5 text-sm text-ink-foreground"
            >
              {m.text}
            </p>
          ) : (
            <div
              key={i}
              className="text-sm leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:opacity-80 [&_code]:rounded [&_code]:bg-fill-strong [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_hr]:my-4 [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-hairline [&_pre]:bg-fill [&_pre]:p-3 [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-hairline [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-hairline [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
            </div>
          ),
        )}
        {waiting && <Thinking />}
        {busy && status && (
          <p className="animate-pulse text-sm text-muted">⚙ {status}</p>
        )}
        <div ref={bottomRef} className="scroll-mb-24" />
      </div>

      <form onSubmit={send} className="sticky bottom-0 pb-4 pt-2">
        <div className="glass flex items-end gap-2 rounded-[1.75rem] py-1.5 pl-4 pr-1.5">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask about your money…"
            maxLength={4000} // keep in sync with MAX_MESSAGE_LENGTH in app/api/chat/route.ts
            // text-base on mobile: <16px inputs trigger iOS zoom-on-focus (#56);
            // field-sizing-content auto-grows without JS (Chrome 123+)
            className="max-h-40 flex-1 resize-none self-center bg-transparent py-1.5 text-base outline-none field-sizing-content placeholder:text-muted sm:text-sm"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="btn"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={input.trim().length === 0}
              className="btn btn-primary"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
