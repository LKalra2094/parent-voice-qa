import { NextRequest, NextResponse } from "next/server";
import { generateAnswer, ConversationMessage } from "@/app/lib/pipeline";

/**
 * POST /api/ask-text
 * Accepts: JSON { text: string, history?: ConversationMessage[] }
 * Returns: audio/mpeg response
 *
 * Faster pipeline: skips STT, goes straight to Exa → LLM → TTS (~2-3s)
 * Frontend should handle STT locally using browser Speech Recognition API.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, history = [] } = body as {
      text: string;
      history?: ConversationMessage[];
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    console.log("Received text:", text);

    return generateAnswer(text.trim(), history);
  } catch (error) {
    console.error("Pipeline error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
