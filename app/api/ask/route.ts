import { NextRequest, NextResponse } from "next/server";
import { generateAnswer, ConversationMessage } from "@/app/lib/pipeline";

/**
 * POST /api/ask
 * Accepts: multipart form with "audio" file + optional "history" JSON
 * Returns: audio/mpeg response
 *
 * Full pipeline: STT → Exa → LLM → TTS (~4-6s)
 * Use /api/ask-text instead if frontend handles STT locally (~2-3s)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const historyRaw = formData.get("history") as string | null;
    const kidId = formData.get("kid_id") as string | null;
    const conversationId = formData.get("conversation_id") as string | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Parse conversation history
    let history: ConversationMessage[] = [];
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw);
      } catch {
        console.warn("Invalid history JSON, ignoring");
      }
    }

    // Speech-to-Text via ElevenLabs Scribe
    const sttFormData = new FormData();
    sttFormData.append("file", audioFile);
    sttFormData.append("model_id", "scribe_v1");

    const sttResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
      body: sttFormData,
    });

    if (!sttResponse.ok) {
      const err = await sttResponse.text();
      console.error("STT error:", err);
      return NextResponse.json({ error: "Speech-to-text failed" }, { status: 500 });
    }

    const sttResult = await sttResponse.json();
    const transcribedText = sttResult.text;
    console.log("Transcribed:", transcribedText);

    // Run the rest of the pipeline (Exa → LLM → TTS)
    return generateAnswer(transcribedText, history, {
      kid_id: kidId || undefined,
      conversation_id: conversationId || undefined,
    });
  } catch (error) {
    console.error("Pipeline error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
