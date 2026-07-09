import { NextResponse } from "next/server";
import { syncAll } from "@/lib/sync";

export async function POST() {
  return NextResponse.json(await syncAll());
}
