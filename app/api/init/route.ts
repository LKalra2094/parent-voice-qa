import { NextResponse } from "next/server";
import { initSchema } from "@/app/lib/db";

export async function POST() {
  try {
    await initSchema();
    return NextResponse.json({ ok: true, message: "Schema initialized" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Schema init failed:", message);
    return NextResponse.json({ error: "Schema init failed", detail: message }, { status: 500 });
  }
}
