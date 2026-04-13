# US-16 — Soul Document Iteration (Brevity + Vocabulary)

**Created**: April 2026
**Status**: In Progress

---

## Epic Summary

Iterate on the AI Nanny soul document to fix two observed problems: (1) responses are too long for young children, and (2) vocabulary is too advanced (e.g., "atmosphere," "molecules," "nitrogen"). The fix requires both a prompt rewrite and a pipeline change to inject the child's actual age into the LLM context.

## Stories

| ID | Story | Acceptance Criteria | Status |
|----|-------|---------------------|--------|
| 16.1 | Pass child's age into LLM prompt | When kid_id is provided, look up age from DB and inject it into the system prompt. If no kid_id or no age, fall back to age-inference from question complexity | Pending |
| 16.2 | Rewrite prompt with hard length constraints per age tier | Prompt specifies explicit word-count ceilings: ~20-40 words (3-5), ~40-70 words (6-9), ~60-100 words (10-13). Llama 3.3 consistently stays within bounds | Pending |
| 16.3 | Add vocabulary constraints per age tier | Prompt bans complex/Latin-root words for young tiers. Only ages 10+ get proper terminology (with inline explanation). Tested against known failures like "atmosphere," "molecules" | Pending |
| 16.4 | Add content guardrails | Hard rules for: medical (defer to parent/doctor), violence/weapons (redirect), adult content (refuse), self-harm (warmth + escalate to adult), religion/politics (neutral), parental authority (never undermine) | Pending |
| 16.5 | Dynamic max_tokens by age tier | Reduce max_tokens sent to Groq: ~100 for ages 3-5, ~150 for 6-9, ~250 for 10-13. Prevents runaway length even if prompt constraints fail | Pending |
| 16.6 | Validation testing | Test revised prompt against a set of representative questions across all three age tiers. Compare old vs. new responses for length, vocabulary, and guardrail compliance | Pending |

## Notes

- This is a continuation of US-11 (soul document). US-11 established the personality and tone; this epic tightens the output constraints.
- Age range updated to 3-13 (was 4-14 in original prompt).
- Llama 3.3 70B needs blunt, explicit constraints — soft suggestions like "keep it concise" are insufficient.
