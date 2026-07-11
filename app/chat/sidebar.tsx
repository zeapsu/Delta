"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Conversation = { id: number; name: string };

// Conversation list (#55): persistent sidebar on desktop, slide-in drawer on
// mobile. Server page passes the data; navigation is plain <Link>s so the
// keyed <Chat> remount works exactly like before. Rename is the only mutation
// here — delete stays in the chat header because deleting the *active*
// conversation must clear Chat's client state (gotcha #40).
export function ChatSidebar({
  conversations,
  activeId,
}: {
  conversations: Conversation[];
  activeId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const activeName = conversations.find((c) => c.id === activeId)?.name;

  const list = (
    <>
      <Link
        href="/chat"
        onClick={() => setOpen(false)}
        className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + New chat
      </Link>
      <nav className="mt-2 flex flex-col gap-0.5">
        {conversations.map((c) => (
          <Row key={c.id} conversation={c} active={c.id === activeId} onNavigate={() => setOpen(false)} />
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* mobile: slim bar with drawer trigger + active title */}
      <div className="sticky top-11 z-10 flex items-center gap-2 border-b bg-background px-4 py-2 sm:hidden dark:border-zinc-800">
        <button
          type="button"
          aria-label="Conversations"
          onClick={() => setOpen(true)}
          className="rounded-md border px-2.5 py-1.5 text-sm dark:border-zinc-700"
        >
          ☰
        </button>
        <span className="truncate text-sm opacity-80">{activeName ?? "New conversation"}</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-30 sm:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col overflow-y-auto border-r bg-background px-2 py-3 dark:border-zinc-800">
            {list}
          </div>
        </div>
      )}

      {/* desktop: persistent sidebar under the sticky nav */}
      <aside className="sticky top-11 hidden h-[calc(100dvh-2.75rem)] w-60 shrink-0 flex-col overflow-y-auto border-r px-2 py-3 sm:flex dark:border-zinc-800">
        {list}
      </aside>
    </>
  );
}

function Row({
  conversation,
  active,
  onNavigate,
}: {
  conversation: Conversation;
  active: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conversation.name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === conversation.name) {
      setEditing(false);
      setName(conversation.name);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversation.id, name: trimmed }),
      });
      if (!res.ok) throw new Error();
      setEditing(false);
      router.refresh();
    } catch {
      setName(conversation.name);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        disabled={saving}
        maxLength={100} // keep in sync with MAX_NAME_LENGTH in app/api/conversations/route.ts
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setName(conversation.name);
            setEditing(false);
          }
        }}
        className="rounded-md border px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
    );
  }

  return (
    <div
      className={`group flex items-center rounded-md ${
        active ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
      }`}
    >
      <Link
        href={`/chat?c=${conversation.id}`}
        onClick={onNavigate}
        className="min-w-0 flex-1 truncate px-3 py-2 text-sm"
      >
        {conversation.name}
      </Link>
      <button
        type="button"
        aria-label={`Rename ${conversation.name}`}
        onClick={() => setEditing(true)}
        className="px-2 py-2 text-xs opacity-40 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-60"
      >
        ✎
      </button>
    </div>
  );
}
