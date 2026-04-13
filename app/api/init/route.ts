import { NextResponse } from "next/server";
import { initSchema } from "@/app/lib/db";

export async function POST() {
  try {
    await initSchema();
    return NextResponse.json({ ok: true, message: "Schema initialized" });
  } catch (error) {
    console.error("Schema init failed:", error);
    return NextResponse.json({ error: "Schema init failed" }, { status: 500 });
  }
}
