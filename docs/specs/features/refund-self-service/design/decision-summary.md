# Refund — Alternatives, trade-offs and decision

← [Spec](../spec.md) · Discovery: [findings.md](findings.md)

The decisions behind the requirements in [`spec.md`](../spec.md): the options considered, how they
compare, and what was chosen and why. The full analysis per decision is in [`3-alternatives.md`](../discovery/3-alternatives.md).

## Alternatives

*The full options, weights, matrices and sensitivity checks are in
[`3-alternatives.md`](../discovery/3-alternatives.md); the money and consistency decisions are in
[ADR-037](../../../../adr/037-refund-payout-hold-and-money-consistency.md).*

**Main decisions**

| Decision | Options considered | Chosen |
|---|---|---|
| A1: who decides a refund | M1 no questions in the window · M2 window + certificate (Coursera) · M3a + progress, quizzes, account history (Udemy) · **M3b** = M3a + opened lessons · M4 manual review of every request (a contact form, the admin decides and refunds by hand; the leaks are closed either way) · M5 waiver at purchase · the instructor decides · AI moderation | **M3b**: automatic rules, the admin sees appeals only |
| Q13: progress threshold | N = 2 · N = 2 + 20% · "≤ 3 lessons → 1" · `min(3, L − 1)` · by duration · **`min(3, ⌊L/2⌋)` opened lessons** | `min(3, ⌊L/2⌋)` |
| A3: window length | 7 days · **14 days** · 30 days · 14 days from the first opened lesson (≤ 30 from payment) | 14 days from payment |
| A8: who bears the Stripe fee | **the platform** · split 20/80 on every sale · the instructor on refunds only · the student (eliminated: full refunds only) | The platform |
| Q18 / ADR-037: when the instructor is paid | transfer at sale and reverse on refund (status quo) · `delay_days` on Stripe · manual payout schedule · **hold on the platform until the window closes** | Hold |
| C2.4: transfer state change | **compare-and-set + `transferring`** · row lock across the Stripe call · advisory lock · Redis lock | Compare-and-set |
| T4: payout trigger | **Vercel Cron** · GitHub Actions · lazily on the next event · Upstash QStash | Vercel Cron + "Run job now" |
| S7: reconciliation | **event replay through the webhook handler** · list refunds · check every charge · none | Event replay |
| S2: purchases before launch | accept the risk · no refund for old purchases · **phased launch** · manual only | Phased launch: hold first, button 14 days later |
| D2: progress after a refund | **delete on refund** · reset on repeat purchase · delete nothing, tie progress to the purchase · continue where they left off | From scratch, cleaned when the refund is applied |
| E2: certificate | clear `completedAt` · filter by status · **explicit revocation field + reason** | Revocation field |

**Decisions made while writing this spec** (A6, DC, OQ-1–OQ-7, DL, D1, E2-R, T10, T27, FR-S15, FS-3,
REC, BATCH, C-TEXT, UF-3, UF-6, EC-3, EC-12, EC-19, UI-1 and others) are indexed, each with its options, at
the end of [`3-alternatives.md`](../discovery/3-alternatives.md#index-of-decisions-made-while-writing-the-spec).


## Trade-offs

Criteria were named and weighted before scoring; scale ++ = 2 … −− = −2, score × weight. The
weights and scores are mine, the facts behind them are in `3-alternatives.md`.

**A1: who decides** (K4 is a veto: an option scoring −− is dropped before totalling)

| Criterion (weight) | M2 | M3a | M3b | M4 |
|---|---|---|---|---|
| K1 time to decision (1) | ++ | ++ | ++ | −− |
| K2 admin workload (2) | ++ | + | + | −− |
| K3 consistency (3) | ++ | + | + | − |
| K4 abuse protection (3, veto) | **−− veto** | − | ++ | + |
| K5 complexity (2) | ++ | − | −− | ++ |
| **Total** | dropped (10 without the veto) | 2 | **9** | −2 |

Among the rule-based options M3b wins at any K5 weight; without the veto M2 would win, so that
choice rests on abuse being unacceptable, not on a weight. M4 (a human decides every request)
overtakes M3b only when complexity weighs more than 4.75, above the heaviest criterion (3); with
admin workload ignored entirely (K2 = 0, the case of no real traffic) only above 3.25. So the choice
of rules over a human rests on an instant, consistent decision for the student, not on a guess about
request volume.

**A3: window length**

| Criterion (weight) | 7 days | **14 days** | 30 days | 14 from first open |
|---|---|---|---|---|
| Worst-case instructor wait (appeal decided on time) | 24 d | 31 d | 47 d | 47 d |
| K1 time to evaluate (2) | − | + | ++ | ++ |
| K2 instructor's wait (2) | ++ | + | −− | − |
| K3 appeal of the guarantee (1) | − | + | ++ | + |
| **Total** | 1 | **5** | 2 | 3 |

14 days holds while the instructor's wait matters (K2 = 2); at K2 = 1 it ties with 30 days.

**A8: the Stripe fee**

| Criterion (weight) | **Platform** | Split 20/80 | Instructor on refunds |
|---|---|---|---|
| K1 platform loss (1) | −− | + | + |
| K2 fairness to the instructor (2) | ++ | − | −− |
| K4 complexity (2) | ++ | − | −− |
| **Total** | **6** | −3 | −7 |

**Without a matrix:** C2.4, T4 and S7 were decided on one dominant criterion each (no transaction
across a network call; no new service; one handler for webhook and replay), recorded in ADR-037.

**What these decisions make worse** (from the "What I give up" notes in `3-alternatives.md`):
- **Student:** stricter than today's promise: 14 days instead of 30, a lesson limit, no refund after
  a certificate, one refund per course. An honest student who opened more than the threshold must
  appeal and wait for an admin (A1, Q13, A3). A refund erases the course's progress, so a repurchase
  starts from scratch, and records erased before a refund fails at the bank are not restored (D2,
  FS-3).
- **Instructor:** paid after the window instead of at sale: 14 days; ≈ 31 with an appeal the admin
  decides on time; for a direct, threshold or account-limit appeal the money stays held until the
  admin decides, with no upper bound (A3, ADR-037, T11). No refund reasons, so no course feedback
  from refunds (OQ-4). A course with purchases cannot be deleted, only unpublished (AS-8, T27).
- **Platform:** keeps the Stripe fee on every refund (A8); admin time on appeals (AS-4); a daily job
  and its monitoring to operate (T4); a chargeback after release is its loss (DL).
- **Accuracy:** "opened" is not "read" (AS-5); the threshold of 3 rests on seed data (AS-3); multiple
  accounts can bypass the account limit (T10, accepted); the learning path's one-sentence reasons can
  draw on unopened lessons (AI-C6, accepted).
- **Size:** six refund paths, each applying the same effects once, is more to build and test than the
  manual review of every request (M4).


## Decision

**What and why, in this context:**

- **Automatic rules decide; an admin sees appeals only (A1, M3b).** The leaks are closed by the hold
  and the refund effects whoever decides, so A1 is only about who decides. Rules without a progress
  signal (M2, M3a) let abuse through automatically, which is unacceptable (K4 veto). A human deciding
  every request (M4) scores −2 against M3b's 9 and wins only if complexity outweighs every other
  criterion (K5 weight above 4.75, or above 3.25 with admin workload ignored): the student gets an
  instant answer by the same rules as everyone else instead of waiting days for one person's
  judgment. An honest student wrongly refused has one appeal; M4 stays the fallback if the rules prove
  wrong (Success metrics).
- **The rule counts opened lessons, at most `min(3, ⌊L/2⌋)` (Q13).** Before buying, a student sees
  only a trailer; in all 7 dev-DB courses the first two lessons are intro and setup (seed data,
  AS-3), so the third is the first substantive one. "Complete" is a student-set mark and can be
  skipped, so it cannot be the signal. Opening is necessary for consuming, not proof of it (AS-5).
- **14 days from payment (A3).** Long enough to start and judge a course; it bounds the instructor's
  wait at ≈ 31 days when the admin decides appeals on time; a direct, threshold or account-limit
  appeal holds the money until the admin decides (T11). A longer guarantee selling better is an unverified assumption (AS-2).
- **The instructor's share is held until the window closes (ADR-037).** It closes the three money
  leaks found in Discovery (D-4, D-5, D-6) and means a refund in the window never claws money back.
  Stripe cannot hold it for our charge model (D-15).
- **One release path, compare-and-set, list-before-retry, daily job (ADR-037).** Money consistency
  must not depend on a lock service or on idempotency keys that expire after 24 h.
- **The platform bears the Stripe fee (A8).** It costs ~2% of the platform's share (its 20%) at a
  10% refund rate (an assumption), i.e. ~0.35% of total sales, while any split worsens terms for
  every instructor and needs new mechanics.
- **A lost bank dispute is a refund path (DL).** While the share is held, it is cancelled and the
  effects apply; otherwise the hold would pay out a sale whose money the bank has returned. After
  release the platform bears it.
- **The refund lives on the Purchases page, not the course page (UI-1).** Refunds are not the core of
  a learning product: the course page stays about learning, and a student who wants their money back
  looks where their purchases and invoices already are. The rules are stated once, in the refund
  policy on `/pricing`, and in the action's tooltip, not as banners.
- **Phased launch (S2).** Hold first, the button 14 days later: every purchase in its window when the
  button appears is already held, so no transition rules are needed.
- **Content only from opened lessons (FR-P19a).** The AI tutor and study guides could otherwise
  consume a whole course from one opened lesson, which would make the threshold meaningless.

**Revisit triggers** are recorded per decision in `3-alternatives.md` (e.g. more than 10 appeals a week
for 4 weeks; the share of automatic refunds twice the first-4-weeks baseline).
