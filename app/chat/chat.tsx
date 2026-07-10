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
    <p className="animate-pulse text-sm opacity-60">
      Thinking… {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
    </p>
  );
}

export function Chat({
  conversations,
  conversationId,
  initialMessages,
}: {
  conversations: { id: number; name: string }[];
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
    }
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
        // mid-session updates the URL via history.replaceState (line ~59), which
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
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeId ?? ""}
          disabled={busy || deleting}
          onChange={(e) => router.push(e.target.value ? `/chat?c=${e.target.value}` : "/chat")}
          className="rounded-md border px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {activeId === null && (
            <option value="" disabled>
              New conversation
            </option>
          )}
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {activeId !== null && (
          <>
            <button
              type="button"
              onClick={() => router.push("/chat")}
              disabled={busy}
              className="rounded-md border px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              New
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy || deleting}
              className="rounded-md border px-2 py-1 text-sm text-red-600 disabled:opacity-50 dark:border-zinc-700"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-sm opacity-60">
            Ask about your spending, budgets, subscriptions, or net worth.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="self-end rounded-md border bg-white px-3 py-2 text-sm dark:bg-zinc-900"
            >
              {m.text}
            </p>
          ) : (
            <div
              key={i}
              className="text-sm [&_a]:underline [&_code]:font-mono [&_code]:text-xs [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:p-3 [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
            </div>
          ),
        )}
        {waiting && <Thinking />}
        {busy && status && (
          <p className="animate-pulse text-sm opacity-60">⚙ {status}</p>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message"
          maxLength={4000} // keep in sync with MAX_MESSAGE_LENGTH in app/api/chat/route.ts
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
