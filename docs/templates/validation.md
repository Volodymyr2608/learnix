<!--
TEMPLATE · validation.md (Stage 4 of 4 — how to VERIFY it works)
Influences: BMAD-METHOD (QA gate / acceptance criteria), Spec Kit (testable specs), test pyramid.

How to use:
  1. Fill this from ALL prior docs: every FR in requirements.md and every risk in spec.md should be
     covered by a check here. The Traceability table is the proof.
  2. Split checks by the repo's test pyramid: unit (no DB, deps mocked) · integration (real
     learnix_test DB) · evals (offline LLM quality, if relevant) · manual (real services).
  3. Each manual scenario is reproducible: prereqs + numbered steps + the exact expected result.
  4. "Definition of done" is the gate — the feature ships only when every box is green.
Delete this comment block and every <!-- guidance --> note before finalising.
-->

# Validation: <Feature Name>

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.
<!-- - `pnpm eval <name>` — only if this feature changes prompts/LLM behaviour. -->

### Unit tests (`*.test.ts` — no DB, external deps mocked)

<!-- One bullet per pure-logic behaviour, with the concrete expected value. -->
- `<module/fn>`: <input → expected output / behaviour>.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

<!-- Service + repository behaviour against the real schema. Cover idempotency, transactions,
     aggregations, and failure paths. -->
- `<service/repo behaviour>`: <what is asserted against the DB>.

## Traceability (every requirement is covered)

<!-- The QA gate's backbone: each FR maps to the check(s) that prove it. No FR may be unmapped. -->

| Requirement | Covered by |
|-------------|-----------|
| FR1 | <test name / manual scenario #> |
| FR2 | <...> |

## Manual test scenarios

<!-- Real end-to-end runs a human (or agent) can reproduce. Include setup. -->

Prereqs:
```bash
# env/services/commands needed, e.g. external CLI listeners, seed data, pnpm dev
```

1. **<Scenario name>:** <action> → <exact expected result (state + UI + data)>.
2. ...

## Edge cases & regression

<!-- The nasty paths: concurrency, retries/duplicates, permission boundaries (IDOR), empty/zero
     states, and anything the feature touches that must NOT break. -->

- ...

## Definition of done

<!-- The ship gate. All must be true. -->

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` are mitigated or explicitly accepted.
- [ ] Docs updated (CLAUDE.md / ADR / roadmap) where the change warrants it.