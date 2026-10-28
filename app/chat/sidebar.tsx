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
        className="btn btn-primary"
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
      <div className="glass sticky top-14 z-10 mx-2 flex items-center gap-2 rounded-full px-1.5 py-1.5 sm:hidden">
        <button
          type="button"
          aria-label="Conversations"
          onClick={() => setOpen(true)}
          className="btn btn-sm"
        >
          ☰
        </button>
        <span className="truncate text-sm">{activeName ?? "New conversation"}</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-30 sm:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="glass absolute inset-y-2 left-2 flex w-64 flex-col overflow-y-auto rounded-3xl px-2 py-3">
            {list}
          </div>
        </div>
      )}

      {/* desktop: persistent sidebar under the sticky nav */}
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 flex-col py-2 pl-4 sm:flex">
        <div className="surface flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {list}
        </div>
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
        className="field sm:w-full"
      />
    );
  }

  return (
    <div
      className={`group flex items-center rounded-xl ${
        active ? "bg-fill-strong font-medium" : "hover:bg-fill"
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
