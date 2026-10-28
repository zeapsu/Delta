import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { Chat } from "./chat";
import { ChatSidebar } from "./sidebar";

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
    <div className="flex flex-1 flex-col sm:flex-row">
      <ChatSidebar conversations={allConversations} activeId={conversationId} />
      {/* min-w-0 is load-bearing: wide markdown (pre/table) otherwise blows the flex row */}
      <main className="flex min-w-0 flex-1 flex-col">
        <Chat
          key={conversationId ?? "new"}
          conversationId={conversationId}
          initialMessages={initialMessages as { role: "user" | "assistant"; text: string }[]}
        />
      </main>
    </div>
  );
}
