# Sprint 6 — Technical Spec

**Created**: April 2026
**Status**: Closed

---

## Focus

Soul document iteration: fix response length, vocabulary, and add content guardrails. Delivers US-16 stories 16.1–16.6.

## Problem

Llama 3.3 70B ignores soft prompt guidance. Responses to young children use advanced vocabulary ("atmosphere," "molecules," "nitrogen") and run 150+ words when they should be 30. The prompt has no hard constraints, no content guardrails, and no awareness of the child's actual age.

## Changes

### 1. Pipeline: age-aware prompt injection (`app/lib/pipeline.ts`)

**What changes:**
- `generateAnswer()` accepts an optional `age` parameter (or looks up age from DB via `kid_id`)
- Build the system prompt dynamically: base soul document + age-specific rules block
- Set `max_tokens` dynamically based on age tier:
  - Ages 3–5: `max_tokens: 100`
  - Ages 6–9: `max_tokens: 150`
  - Ages 10–13: `max_tokens: 250`

**New function:** `getKidAge(kidId: string): Promise<number | null>` in `app/lib/db.ts`
- Simple SELECT query: `SELECT age FROM kids WHERE id = $1`
- Returns null if kid not found or age not set

**Flow change:**
```
Request arrives with kid_id
  → Look up kid's age from DB
  → Select age tier (3-5, 6-9, 10-13)
  → Build prompt with tier-specific rules
  → Set max_tokens for tier
  → Call Groq
```

If no kid_id or no age on record, default to tier 6-9 (safest middle ground).

### 2. Soul document rewrite (`SYSTEM_PROMPT` in `app/lib/pipeline.ts`)

The prompt is restructured into sections with explicit, non-negotiable rules.

**Structure:**

```
Identity (who you are)
Age tier rules (injected dynamically)
  - Word count ceiling
  - Vocabulary rules
  - Sentence structure rules
  - Example response at this tier
Content guardrails (hard rules)
  - Medical → defer to parent/doctor
  - Violence/weapons → redirect
  - Adult content → refuse + redirect
  - Self-harm → warmth + "talk to your parent"
  - Religion/politics → neutral, multi-perspective
  - Parental authority → never undermine
  - Personal info → don't engage
Tone by situation (kept from current prompt)
Topic handling (kept, tightened)
Response format rules (spoken-word, no markdown)
```

**Key prompt engineering changes:**
- Rules stated as "NEVER" / "ALWAYS" / "YOU MUST" — not suggestions
- Each age tier includes a concrete example response to "Why is the sky blue?"
- Vocabulary constraints are explicit: "Use only words a [age] year old would know"
- Length constraints are stated as hard ceilings, not targets

### 3. API routes: pass age through (`app/api/ask/route.ts`, `app/api/ask-text/route.ts`)

Minor change: both routes already pass `kid_id` into `generateAnswer()`. The pipeline change handles the rest internally. No route changes needed unless we want callers to pass age directly (not needed — DB lookup is cleaner).

## Files Affected

| File | Change |
|------|--------|
| `app/lib/pipeline.ts` | Rewrite SYSTEM_PROMPT, add dynamic prompt builder, age-based max_tokens |
| `app/lib/db.ts` | Add `getKidAge()` function |

## Risks

| Risk | Mitigation |
|------|------------|
| Llama 3.3 still ignores constraints | max_tokens hard cap prevents runaway length; test and iterate on prompt wording |
| DB lookup adds latency | Single indexed query on primary key, adds <10ms |
| No age on record for existing kids | Default to tier 6-9; frontend should prompt for age on kid creation |
| Prompt too long hurts Groq performance | Keep prompt under 800 tokens; current is ~400, budget ~400 more |
