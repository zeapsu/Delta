import { Chat } from "./chat";

export default function ChatPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-8 py-16 px-6">
        <h1 className="text-2xl font-semibold">Chat</h1>
        <Chat />
      </main>
    </div>
  );
}
