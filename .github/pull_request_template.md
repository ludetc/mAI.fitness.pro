<!--
Keep this description short and useful. Focus on WHY, not WHAT — the diff is the what.
-->

## Summary

<!-- 1-3 bullets: what this PR changes and why. -->

- 
- 

## Linked issues / roadmap items

<!-- Closes #123. Addresses ROADMAP.md §1.5. -->

## Test plan

<!-- How you verified it. Be honest — "typecheck passes" is fine if that's all; just don't write "works" if you didn't run it. -->

- [ ] `npm run typecheck` passes across all workspaces
- [ ] `apps/api`: relevant routes smoke-tested via curl (document below if applicable)
- [ ] `apps/mobile`: flow walked through in Expo Go or browser (document below if applicable)
- [ ] `DEV_NOTES.md` entry added at top
- [ ] `ARCHITECTURE.md` updated (only if routes/schema/auth/deps/config changed)

Smoke-test commands run:

```
# paste
```

## Checklist

- [ ] No secrets in diff (check `.env`, `.dev.vars`, token strings).
- [ ] No new top-level dependencies without justification.
- [ ] No TypeScript strictness loosened.
- [ ] Followed AI-feature patterns in `AGENTS.md` if touching `lib/ai/` or `prompts/`.
- [ ] No commented-out code.

## Follow-ups deferred

<!-- Anything noticed during the PR but intentionally not addressed. Links here become future issues. -->

- 
