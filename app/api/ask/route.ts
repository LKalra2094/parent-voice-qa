import { NextRequest, NextResponse } from "next/server";

async function getGroqClient() {
  const Groq = (await import("groq-sdk")).default;
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function searchExa(query: string): Promise<string> {
  if (!process.env.EXA_API_KEY) return "";

  try {
    const Exa = (await import("exa-js")).default;
    const exa = new Exa(process.env.EXA_API_KEY);

    const results = await exa.searchAndContents(query, {
      numResults: 3,
      text: { maxCharacters: 500 },
      type: "auto",
    });

    if (!results.results.length) return "";

    return results.results
      .map((r: { title: string | null; text: string | null }) => `${r.title || "Result"}: ${r.text || ""}`)
      .join("\n\n");
  } catch (err) {
    console.error("Exa search error:", err);
    return "";
  }
}

const SYSTEM_PROMPT = `You are a warm, friendly, and knowledgeable assistant answering questions from young children (ages 4-10).

Rules:
- Use simple words a 5-year-old can understand
- Keep answers to 2-3 short sentences
- Be enthusiastic and encouraging
- Never discuss violence, adult topics, or anything scary
- If a question is inappropriate, gently redirect: "That's a great question! How about we talk about something fun instead?"
- Never pretend to be the child's parent or family member
- Use fun comparisons and examples kids can relate to
- If search results are provided, use them to give accurate, up-to-date answers — but still explain in simple kid-friendly language`;

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const historyRaw = formData.get("history") as string | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Parse conversation history (sent from frontend)
    let history: ConversationMessage[] = [];
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw);
      } catch {
        console.warn("Invalid history JSON, ignoring");
      }
    }

    // Step 1: Speech-to-Text via ElevenLabs Scribe
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

    // Step 2: Web search via Exa (runs in parallel with nothing — just await it)
    const searchContext = await searchExa(transcribedText);
    if (searchContext) {
      console.log("Exa search returned results");
    }

    // Step 3: LLM via Groq (Llama 3.3 70B) — with history + search context
    const groq = await getGroqClient();

    // Build message list: system → history → current question
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history (last 10 messages max to stay within context limits)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current question, with search context if available
    const userMessage = searchContext
      ? `${transcribedText}\n\n[Search results for reference — use these to give an accurate answer, but explain simply for a child:]\n${searchContext}`
      : transcribedText;

    messages.push({ role: "user", content: userMessage });

    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 200,
    });

    const answerText = chatCompletion.choices[0]?.message?.content || "Hmm, I'm not sure about that one!";
    console.log("Answer:", answerText);

    // Step 4: Text-to-Speech via ElevenLabs
    const voiceId = process.env.ELEVENLABS_VOICE_ID!;
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: answerText,
          model_id: "eleven_flash_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const err = await ttsResponse.text();
      console.error("TTS error:", err);
      return NextResponse.json({ error: "Text-to-speech failed" }, { status: 500 });
    }

    // Stream the audio back
    const audioBuffer = await ttsResponse.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Transcribed-Text": encodeURIComponent(transcribedText),
        "X-Answer-Text": encodeURIComponent(answerText),
      },
    });
  } catch (error) {
    console.error("Pipeline error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
