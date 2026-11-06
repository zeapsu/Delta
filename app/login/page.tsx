import { redirect } from "next/navigation";
import { safeNext } from "@/lib/login";
import { loginStatus } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Log in · Delta" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const { enabled, signedIn } = await loginStatus();
  if (!enabled || signedIn) redirect(next);
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 pb-16 pt-[18vh]">
      <h1 className="eyebrow px-1">Delta</h1>
      <div className="surface step-in flex flex-col gap-5 p-5 sm:p-6">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
