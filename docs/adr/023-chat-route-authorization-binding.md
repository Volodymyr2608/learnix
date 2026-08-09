# ADR-023: Authorization on chat routes binds the checked identifier to the acted-on one

- **Status**: Accepted
- **Date**: 2026-08
- **Relates to**: ADR-017 (OWASP rules, Rule 2 — ownership/IDOR), ADR-021 (spec-gated workflow)
- **Feature spec**: [`docs/specs/features/ai-chat-route-authorization/spec.md`](../specs/features/ai-chat-route-authorization/spec.md)

## Context

The three AI chat handlers under `app/api/chat/` are the only endpoints in Learnix where a request
body reaches a Prisma query without passing through a tRPC procedure. tRPC procedures get input
validation from their Zod schema and role enforcement from the procedure type; a plain
`export async function POST(req: Request)` gets neither for free.

All three read identifiers straight off `await req.json()` and passed them to Prisma untyped. Prisma
accepts a **filter object** — `{ not: "…" }`, `{ contains: "…" }` — wherever a `String` id is
expected. So a client-controlled identifier could act as a *query* rather than a *value*.

That alone would be a validation bug. What made it an authorization bug is that
`app/api/chat/lesson/route.ts` asked two separate questions with the same untrusted value:

```ts
// query 1 — proves the student may access this lesson
where: { studentId, course: { sections: { some: { lessons: { some: { id: lessonId } } } } } }

// query 2 — fetches the lesson the tutor is then built from
where: { id: lessonId, deletedAt: null }
```

With `lessonId = { not: "<their own lesson>" }`, query 1 matched an enrolled course (it only asks
whether *some* lesson in *some* enrolled course satisfies the filter) while query 2 was unconstrained
by enrollment and could return a lesson from a course the student never bought. `courseId` and
`courseTitle` were then read from the second answer, and the RAG tools were curried with it. Proven
by integration test before the fix.

The same shape existed on `app/api/chat/learning-path/route.ts` in a subtler form: the enrollment
check there is correctly bound (`findByStudentCourse` carries `studentId` and `courseId` in one
query), but the **raw request value** — not the enrollment's `courseId` — was forwarded into
`streamRegenerate`, where `lessonRepository.listOrderedWithConcepts(courseId)` scopes on `courseId`
alone. Also proven by test: the route returned `200` and the repository returned lesson titles from a
course the student had never bought.

`app/api/chat/course/route.ts` had the same untyped body but **not** the bug: its check and its fetch
are a single query (`findFirst({ where: { id, instructorId } })`).

Notably, the pre-existing contract test `entryPoints.contract.test.ts` did not catch any of this. Its
claim about `lessonAI.agent.ts` — "receives the user message guarded at the route" — was true, but it
had been written before the tutor gained RAG, and it described one input channel out of four. The
invariant did not break; it **decayed** as the surface grew.

## Decision

**Authorization on a chat route is a property of the query, not of a sequence of queries. The
identifier that proves access must be the identifier that is acted on.** Concretely, one of:

1. the access check and the subject fetch are the **same** query; or
2. every downstream identifier is read off the **row the access check returned** — never re-derived
   from the request value.

Separately, and secondarily, every `app/api/chat/**` route validates its body against a Zod schema
(`z.cuid()` for ids) before any other work, and a contract test fails when a route reads a body
without a `*Schema` parse.

## Consequences

**The ordering of the two controls is the whole point, and it is counter-intuitive.**

Validation is what makes the tests go red — it is the observable fix, it turns a `500` thrown from
inside a stream into a `400` at the edge, and it is what a reviewer sees in the diff. Binding is what
makes the vulnerability class *unrepresentable*, and it is invisible: once ids must be strings, no
black-box input can distinguish a bound route from an unbound one, because a lesson belongs to
exactly one section which belongs to exactly one course. A test asserting "the tutor is scoped to the
authorizing course" passes against the vulnerable code. We wrote that test, confirmed it was useless
by reverting the route under it, and deleted it.

The consequence to internalize: **if only validation had been applied, every test would be green and
the structural defect would still be there**, waiting for a future refactor to re-expose it. The
enforcement of the binding is that `lesson/route.ts` has one query and no `lessonRepository` import.
If that import returns, the guarantee is gone and nothing will fail.

Other consequences:

- The lesson route's enrollment query grew a nested `select` that carries the lesson. Measured: same
  number of round trips as the previous pair, ~5ms on a 40-section course.
- The `404` branch changed mechanism — a `findFirst` returning `null` became an empty array out of a
  filtered nested select — so it now has an explicit test where it previously had none anywhere.
- The course route's wire contract narrowed: an unrecognized `mode` and an empty `userMessage` are
  now `400` rather than coerced. The only caller already complied.
- The contract test is regex over source text, so it catches the omission, not the logic. Its known
  limit is recorded in the file: it cannot prove the schema was applied to the *body*.

## Alternatives considered

**Zod validation only, no binding.** Cheapest, and closes the exploit as it exists today. Rejected
because it makes correctness depend on a property of id formats (a scalar id resolves to one course)
rather than on the query, and leaves the two-questions structure in place for the next author.

**A shared `withEnrollment()` middleware wrapping every chat route.** Rejected as premature: three
routes with materially different subjects (lesson / course / generation) do not yet share enough
shape, and a wrapper would have hidden the very divergence this ADR exists to name.

**Validating at the repository layer** — teaching `BaseRepository` to reject non-scalar values where
a scalar id is expected. Attractive because it would cover tRPC and every future caller at once, and
worth revisiting. Rejected for now because it fixes the type confusion, not the divergence: two
correctly-typed queries answering two different questions is still the bug.