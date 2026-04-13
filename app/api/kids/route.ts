import { NextRequest, NextResponse } from "next/server";
import { createKid, listKids } from "@/app/lib/db";

export async function GET() {
  try {
    const kids = await listKids();
    return NextResponse.json(kids);
  } catch (error) {
    console.error("Failed to list kids:", error);
    return NextResponse.json({ error: "Failed to list kids" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, age, gender } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const kid = await createKid(name.trim(), age, gender);
    return NextResponse.json(kid, { status: 201 });
  } catch (error) {
    console.error("Failed to create kid:", error);
    return NextResponse.json({ error: "Failed to create kid" }, { status: 500 });
  }
}
