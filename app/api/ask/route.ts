import { NextRequest, NextResponse } from "next/server";

async function getGroqClient() {
  const Groq = (await import("groq-sdk")).default;
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

const SYSTEM_PROMPT = `You are a warm, friendly, and knowledgeable assistant answering questions from young children (ages 4-10).

Rules:
- Use simple words a 5-year-old can understand
- Keep answers to 2-3 short sentences
- Be enthusiastic and encouraging
- Never discuss violence, adult topics, or anything scary
- If a question is inappropriate, gently redirect: "That's a great question! How about we talk about something fun instead?"
- Never pretend to be the child's parent or family member
- Use fun comparisons and examples kids can relate to`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
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

    // Step 2: LLM via Groq (Llama 3 70B)
    const groq = await getGroqClient();
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcribedText },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 200,
    });

    const answerText = chatCompletion.choices[0]?.message?.content || "Hmm, I'm not sure about that one!";
    console.log("Answer:", answerText);

    // Step 3: Text-to-Speech via ElevenLabs
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
