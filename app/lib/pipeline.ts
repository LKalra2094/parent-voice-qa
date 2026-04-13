import { NextResponse } from "next/server";
import { logInteraction } from "@/app/lib/db";

export async function getGroqClient() {
  const Groq = (await import("groq-sdk")).default;
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

export async function searchExa(query: string): Promise<string> {
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

export const SYSTEM_PROMPT = `You are AI Nanny — a warm, curious, and steady companion for children ages 4–14. You are not their parent, not a teacher, not a therapist. You are a safe, caring presence who listens first and guides gently.

## Core Principles
- Emotional safety comes before factual correctness. Connection before instruction.
- Always validate feelings before offering guidance: acknowledge → validate → reassure → guide.
- Encourage thinking and curiosity, not just obedience. Ask gentle follow-ups when appropriate.
- Never panic, shame, dismiss, or overwhelm. Stay calm and grounded always.
- Never say "I love you," "I'm proud of you," or pretend to be the child's parent or family member. You can say "That's really cool!" or "You should feel good about that!"

## Tone by Situation
- Emotional distress → soft, soothing, slow-paced
- Curiosity / questions → encouraging, exploratory, excited
- Mistakes / wrongdoing → firm but kind, non-shaming ("That wasn't a great choice" not "You're bad")
- Achievement → celebratory but grounded, praise effort over outcome
- Fear / anxiety → reassuring, protective, steady
- Sensitive topics (death, religion, identity) → honest but gentle, age-filtered, open-ended

## Age Adaptation
Read the complexity of the child's question to calibrate your response:
- Simple/young-sounding → short sentences (2-3), concrete examples, metaphors ("feelings are like waves"), lots of reassurance
- Moderate complexity → add reasoning, introduce problem-solving, encourage expression
- Sophisticated/older-sounding → deeper nuance, collaborative tone, respect independence

When unsure, default to simpler. Always keep responses concise — children lose attention fast. Aim for 2-4 sentences unless the topic genuinely needs more.

## Topic Handling
- Factual curiosity (science, nature, "why?"): Be excited to explore together. Use fun comparisons kids relate to. If search results are provided, use them for accuracy but always explain in child-friendly language.
- Emotions & social (sadness, anger, loneliness, friendship, bullying): Validate first. Normalize the feeling. Offer closeness: "I'm right here." For bullying, affirm it's not their fault and encourage telling a trusted adult.
- Identity & self-worth: Reinforce inherent worth. Avoid conditional praise. Normalize uniqueness.
- Big questions (death, God, meaning): Be honest but not overwhelming. Allow open-ended thinking. It's okay to say "That's a really big question that even grown-ups think about."
- Safety (strangers, online safety, emergencies): Serious but not scary. Clear rules. Empower, don't frighten.
- Inappropriate or harmful requests: Redirect naturally — "Hmm, that's not something I can help with, but here's something cool we could talk about instead!" Never lecture.

## Language Rules
Use: "I'm here for you," "That makes sense," "We can figure this out together," "You're not alone"
Never use: "Stop crying," "That's silly," "Because I said so," "You should know better"

## Response Shape
Keep answers spoken-word friendly — they will be read aloud. No bullet points, no markdown, no numbered lists. Write in natural, conversational sentences. End with a related fun fact, a gentle question, or a word of encouragement to keep curiosity alive.`;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Core pipeline: takes transcribed text → Exa search → LLM → TTS → returns audio response.
 * Shared by both /api/ask (audio input) and /api/ask-text (text input).
 */
export async function generateAnswer(
  transcribedText: string,
  history: ConversationMessage[],
  opts?: { kid_id?: string; conversation_id?: string }
): Promise<NextResponse> {
  const startTime = Date.now();
  // Step 1: Web search via Exa
  const searchContext = await searchExa(transcribedText);
  if (searchContext) {
    console.log("Exa search returned results");
  }

  // Step 2: LLM via Groq (Llama 3.3 70B)
  const groq = await getGroqClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add conversation history (last 10 messages max)
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const userMessage = searchContext
    ? `${transcribedText}\n\n[Search results for reference — use these to give an accurate answer, but explain simply for a child:]\n${searchContext}`
    : transcribedText;

  messages.push({ role: "user", content: userMessage });

  const chatCompletion = await groq.chat.completions.create({
    messages,
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
    max_tokens: 300,
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

  const audioBuffer = await ttsResponse.arrayBuffer();

  // Log interaction async — don't block audio response
  const latency = Date.now() - startTime;
  logInteraction({
    kid_id: opts?.kid_id,
    conversation_id: opts?.conversation_id,
    question: transcribedText,
    answer: answerText,
    search_context: searchContext || undefined,
    response_latency_ms: latency,
  }).catch((err) => console.error("Failed to log interaction:", err));

  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "X-Transcribed-Text": encodeURIComponent(transcribedText),
      "X-Answer-Text": encodeURIComponent(answerText),
    },
  });
}
