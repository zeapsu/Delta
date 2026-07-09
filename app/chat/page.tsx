import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

type SearchParams = {
  c?: string;
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const allConversations = await db
    .select({ id: conversations.id, name: conversations.name })
    .from(conversations)
    .orderBy(desc(conversations.id));

  const parsed = params.c ? parseInt(params.c, 10) : NaN;
  const conversationId =
    Number.isInteger(parsed) && parsed > 0 && allConversations.some((c) => c.id === parsed)
      ? parsed
      : null;

  const initialMessages = conversationId
    ? await db
        .select({ role: messages.role, text: messages.text })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.id))
    : [];

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold">Chat</h1>
        <Chat
          key={conversationId ?? "new"}
          conversations={allConversations}
          conversationId={conversationId}
          initialMessages={initialMessages as { role: "user" | "assistant"; text: string }[]}
        />
      </main>
    </div>
  );
}
