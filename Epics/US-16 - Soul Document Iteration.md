# US-16 — Soul Document Iteration (Brevity + Vocabulary)

**Created**: April 2026
**Status**: Closed

---

## Epic Summary

Iterate on the AI Nanny soul document to fix two observed problems: (1) responses are too long for young children, and (2) vocabulary is too advanced (e.g., "atmosphere," "molecules," "nitrogen"). The fix requires both a prompt rewrite and a pipeline change to inject the child's actual age into the LLM context.

## Stories

| ID | Story | Acceptance Criteria | Status |
|----|-------|---------------------|--------|
| 16.1 | Pass child's age into LLM prompt | When kid_id is provided, look up age from DB and inject it into the system prompt. If no kid_id or no age, fall back to age 6 tier as default | Done |
| 16.2 | Rewrite prompt with hard length constraints per age tier | 6 age tiers (2, 4, 6, 8, 10, 12) with sentence caps and max_tokens (30–170). Brevity instruction in base prompt | Done |
| 16.3 | Add vocabulary constraints per age tier | Each tier has explicit banned words and approved alternatives. Only age 12 gets "molecules" and "scatter" (with inline explanation). No textbook jargon for younger tiers | Done |
| 16.4 | Add content guardrails | Hard rules for: medical (defer to parent/doctor), violence/weapons (redirect), adult content (refuse), self-harm (warmth + escalate to adult), religion/politics (neutral), parental authority (never undermine), personal info (don't engage) | Done |
| 16.5 | Dynamic max_tokens by age tier | max_tokens per tier: 30 (age 2), 50 (age 4), 75 (age 6), 100 (age 8), 130 (age 10), 170 (age 12) | Done |
| 16.6 | Validation testing | Tested "Why is the sky blue?" across all 6 kid profiles. Responses scale correctly by age in vocabulary, length, and complexity | Done |

## Notes

- This is a continuation of US-11 (soul document). US-11 established the personality and tone; this epic tightens the output constraints.
- Age range covers 2-12 across 6 distinct tiers (was originally 3 tiers).
- Llama 3.3 70B needs blunt, explicit constraints — soft suggestions like "keep it concise" are insufficient.
- Expanded from 3 tiers to 6 after testing showed ages 8/10/12 still used overly advanced vocabulary with fewer tiers.
