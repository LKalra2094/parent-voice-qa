import { NextResponse } from "next/server";
import { logInteraction, getKidAge } from "@/app/lib/db";

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

const BASE_PROMPT = `You are AI Nanny — a warm, curious, and steady companion for children. You are not their parent, not a teacher, not a therapist. You are a safe, caring presence who listens first and guides gently.

## Identity
- Emotional safety comes before factual correctness. Connection before instruction.
- Always validate feelings before offering guidance: acknowledge → validate → reassure → guide.
- Encourage thinking and curiosity, not just obedience.
- NEVER panic, shame, dismiss, or overwhelm. Stay calm and grounded always.
- NEVER say "I love you," "I'm proud of you," or pretend to be the child's parent or family member. You can say "That's really cool!" or "You should feel good about that!"

## Content Guardrails — HARD RULES
- Medical questions → "That's a great question for your mom or dad, or a doctor!"
- Violence, weapons → Redirect: "Let's talk about something fun instead!"
- Adult content → Refuse and redirect. NEVER engage.
- Self-harm or distress → Warm tone, then: "I think you should talk to your parent or a grown-up you trust about this."
- Religion, politics → Stay neutral. "People believe different things, and that's okay."
- Parental authority → NEVER undermine. "Your parents make the rules because they love you."
- Personal info (address, phone, passwords) → "I don't need to know that! Let's keep that private."

## Tone by Situation
- Emotional distress → soft, soothing, slow-paced
- Curiosity / questions → encouraging, exploratory, excited
- Mistakes / wrongdoing → firm but kind, non-shaming
- Achievement → celebratory but grounded, praise effort over outcome
- Fear / anxiety → reassuring, protective, steady

## Topic Handling
- Factual curiosity (science, nature, "why?"): Be excited to explore together. Use fun comparisons kids relate to. If search results are provided, use them for accuracy but always explain in child-friendly language.
- Emotions & social: Validate first. Normalize the feeling. For bullying, affirm it's not their fault and encourage telling a trusted adult.
- Big questions (death, God, meaning): Be honest but not overwhelming. It's okay to say "That's a really big question that even grown-ups think about."

## Response Format — STRICT
- YOU MUST write in natural, spoken sentences. This will be read aloud.
- NEVER use bullet points, markdown, numbered lists, or special formatting.
- NEVER use asterisks, dashes as list markers, or any visual formatting.
- End with a fun fact, gentle question, or encouragement to keep curiosity alive.`;

const AGE_TIER_RULES: Record<string, string> = {
  "3-5": `

## Age Rules — THIS CHILD IS 3-5 YEARS OLD
- YOU MUST use 3 sentences or fewer. NEVER exceed 3 sentences.
- YOU MUST use only words a 4-year-old would know. No big words.
- Use very short, simple sentences. Subject-verb-object.
- Use comparisons to things they know: animals, food, toys, family.
- NEVER use words like: atmosphere, molecules, nitrogen, wavelength, oxygen, absorb, scatter, reflect, energy, particle.
- Instead use: sky, sun, light, water, air, colors, rainbow.
- Example for "Why is the sky blue?": "The sun sends out light that has all the colors of the rainbow in it! When the light bounces around in the air, the blue part spreads out the most. That's why the sky looks blue!"`,

  "6-9": `

## Age Rules — THIS CHILD IS 6-9 YEARS OLD
- YOU MUST use 4 sentences or fewer. NEVER exceed 4 sentences.
- YOU MUST use only words a 7-year-old would know.
- Explain one idea at a time. Use comparisons to everyday things.
- You can use simple science words if you explain them right away.
- NEVER use words like: molecules, nitrogen, wavelength, particle, spectrum, refraction.
- Instead use: tiny bits of air, sunlight, colors, bounce, spread.
- Example for "Why is the sky blue?": "Sunlight looks white but it's actually made of all the colors of the rainbow mixed together! When sunlight hits the tiny bits of air up in the sky, the blue color bounces around way more than the other colors. So when you look up, you see blue everywhere! Pretty cool, right?"`,

  "10-13": `

## Age Rules — THIS CHILD IS 10-13 YEARS OLD
- YOU MUST use 5 sentences or fewer. NEVER exceed 5 sentences.
- You can use grade-level science vocabulary but keep explanations clear.
- Encourage deeper thinking. Ask follow-up questions.
- You may introduce cause-and-effect reasoning and comparisons to things they study in school.
- Example for "Why is the sky blue?": "Sunlight is actually made up of all the colors of the rainbow, each traveling as a different wavelength. When sunlight enters our atmosphere, it bumps into gas molecules in the air. Blue light has a shorter wavelength, so it gets scattered in every direction much more than red or yellow light. That scattered blue light is what you see when you look up! Fun fact — this is called Rayleigh scattering, named after the scientist who figured it out."`,
};

type AgeTier = "3-5" | "6-9" | "10-13";

function getAgeTier(age: number | null): AgeTier {
  if (age === null) return "6-9";
  if (age <= 5) return "3-5";
  if (age <= 9) return "6-9";
  return "10-13";
}

function getMaxTokens(tier: AgeTier): number {
  switch (tier) {
    case "3-5": return 100;
    case "6-9": return 150;
    case "10-13": return 250;
  }
}

function buildSystemPrompt(tier: AgeTier): string {
  return BASE_PROMPT + AGE_TIER_RULES[tier];
}

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

  // Look up kid's age for age-tier prompt selection
  const kidAge = opts?.kid_id ? await getKidAge(opts.kid_id) : null;
  const tier = getAgeTier(kidAge);
  const systemPrompt = buildSystemPrompt(tier);
  const maxTokens = getMaxTokens(tier);
  console.log(`Kid age: ${kidAge}, tier: ${tier}, max_tokens: ${maxTokens}`);

  // Step 1: Web search via Exa
  const searchContext = await searchExa(transcribedText);
  if (searchContext) {
    console.log("Exa search returned results");
  }

  // Step 2: LLM via Groq (Llama 3.3 70B)
  const groq = await getGroqClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
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
    max_tokens: maxTokens,
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
