# Refund — Alternatives and Decision

*Translated from the Ukrainian working original on 2026-11-16; content unchanged.*

← [Spec](../spec.md) · Previous stage: [Analysis](analysis.md)

**Stage order changed (2026-11-15).** Alternatives comes before Specification: without the A1 and
Q13 decisions it is impossible to describe even the user flow. We write the specification once, on
decisions already made.

| Question | Status |
|---|---|
| A1 / Q10 — who decides on a refund | **Decided 2026-11-15:** M3b |
| Q13 — progress threshold | **Decided 2026-11-15:** `min(3, ⌊L/2⌋)` opened lessons |
| A3 / Q14 — window length (+ Q18) | **Decided 2026-11-15:** 14 days from payment; Q15 confirmed |
| A8 / Q17 — who bears the Stripe fee | **Decided 2026-11-15:** the platform (unchanged) |
| S2 — old purchases during the transition period | **Decided 2026-11-15:** phased launch |
| D2 — what to do with progress after a refund | **Decided 2026-11-15:** from scratch; cleanup on a confirmed refund |
| C2.4 — atomic transfer state transition | **Decided 2026-11-15:** conditional update + Stripe idempotency key |
| T4 — who triggers the payout after the window | **Decided 2026-11-15:** Vercel Cron + admin panel + email |
| S7 — reconciliation with Stripe | **Decided 2026-11-15:** synchronously with `refunds.create` + event replay in cron |
| Certificate revocation (E2) | **Decided 2026-11-15:** explicit revocation field; verification page is a separate feature |
| A6 — how the instructor sees held money | **Decided 2026-11-16:** V2, two amounts; refund requests are not shown to the instructor |
| DC — double charge for the same course | **Decided 2026-11-16:** V3 (guard access) + V2 (auto-refund the duplicate) |
| OQ-1 — threshold exceeded: request or appeal | **Decided 2026-11-16:** V3, a direct appeal instead of the button |
| OQ-2 — account-level refund limit | **Decided 2026-11-16:** V2, 3 automatic refunds per 12 months, then a direct appeal |
| OQ-3 — do platform-initiated refunds use up the student's one refund | **Decided 2026-11-16:** V1, no (admin exception and Dashboard); E2 revised |
| OQ-4 — notify the instructor of a refund | **Decided 2026-11-16:** V1, no notification; aggregated reasons out of scope |
| OQ-5 — the admin misses the 14-day appeal review | **Decided 2026-11-16:** V2, reminders + automatic approval on day 14 |
| OQ-6 — warn on repurchase that there is no refund | **Decided 2026-11-16:** V1, a warning above the buy button |
| OQ-7a — partial refund in the Dashboard (E3) | **Decided 2026-11-16:** (c), keep access, record and flag; the platform bears it |
| OQ-7b — dispute and refund on the same payment (E8) | **Decided 2026-11-16:** V1, check for a dispute before the button and the refund |
| ADR-014 (n8n) → mark superseded | Later, a separate small edit (not Refund) |

## A1 — who decides on a refund

*2026-11-15. I deliberately reopened the earlier decision (Q10 "admin approves", C5.1 hybrid),
because I wrote the criteria already knowing the answer. Platform research and filling in the
matrix — AI; criteria, weights, veto, choice and score corrections — mine (see
[AI log](ai-decision-log.md)).*

### Criteria and weights

Criteria are derived from the problem statement and the value table ([`discovery.md` §1](discovery.md)).
Weights were set **before** scoring the options. Scale: 1 — nice to have, 2 — important, 3 — critical.

| # | Criterion | What it measures | Weight | Why |
|---|---|---|---|---|
| K1 | Time to decision | How long the student waits and how long the instructor's money is held (C1.2) | 1 | Covered by the "review within N days" policy (answer to finding V2, SLA, in [the AI analysis review](ai-raw/analysis-review.md)). The instructor waits for the window + review: this is accepted, A3 will shorten the window |
| K2 | Admin workload | Share of refund requests the admin reviews by hand | 2 | Everything that can be decided without the admin, we decide without them |
| K3 | Consistency of decisions | Identical requests get the same decision; the student can predict the outcome | 3 | One set of rules for everyone |
| K4 | Abuse protection | Can one get money back for a course actually completed (Q12), including by bypassing F4 | 3, **veto** | Both the platform and the instructor lose. An option with −− is discarded before scoring: abuse that passes automatically is unacceptable regardless of other advantages |
| K5 | Implementation complexity | How much has to be built and secured | 2 | The 25.11 deadline is real; complex tier (ADR, security-review) |

The criteria "time for the student" and "hold of the instructor's money" are merged into K1: in all
options they move together, so two separate criteria would double the weight of one factor. "Ability
to change my mind" is not included: the options share a common base (refund request + rules), moving
between them is a rule change, not a rework.

### How platforms do it

| Platform | Window | Who decides | Abuse protection | Source |
|---|---|---|---|---|
| Udemy | 30 days | Automation with the right to refuse | "A significant portion" consumed (percentage not published); repeated refunds for a course; excessive number of refunds on the account | [Official help](https://support.udemy.com/hc/en-us/sections/206457407-Refunds) |
| Coursera (single course) | ~14 days | Automation | Certificate obtained → no refund | Third-party sources only ([learnopoly](https://learnopoly.com/?p=6295)); 7 or 14 days — contradictory, **not verified** |
| Teachable | 14 days by default | Platform sets the minimum, author can go longer | A longer window is approved manually; the platform warns about rising chargebacks | [Official help](https://support.teachable.com/en/articles/16631486-custom-refund-policies) |
| Domestika | 14 days | — | No rules on the share watched found | Third-party sources only, **not verified** |

EU ([Directive 2011/83, art. 16(m)](https://www.legislation.gov.uk/eudr/2011/83/article/16)): 14 days
to withdraw; for digital content the right may lapse once access begins, if the buyer explicitly
agreed. The limits of the exception were narrowed by the CJEU ruling on streaming (2026,
[overview](https://www.insideprivacy.com/consumer-protection/cjeu-decides-when-streaming-subscriptions-are-subject-to-the-right-of-withdrawal/)).
The legal side is Q24, out of scope.

**Takeaway from practice:** platforms do not measure whether the student actually studied. They
combine a short window, one objective rule, account-level limits and automation by default; a human
only for appeals.

### Options

| # | Model | Status | Reason |
|---|---|---|---|
| M1 | No questions asked within the window | Rejected | Room for abuse |
| M2 | Window + certificate, automatic (Coursera) | Considered, eliminated by the K4 veto | See matrix |
| M3a | M2 + progress + quizzes / tutor + refund history on the account; auto-refusal by heuristic, appeal to the admin (Udemy) | Considered | See matrix |
| M3b | M3a + tracking of opened lessons | **Chosen** | See matrix |
| M4 | Manual review of every refund request | Rejected | Admin overload |
| M5 | Waiver of the refund right at purchase | Rejected | Legal question (Q24) |
| — | The instructor decides | Rejected | Conflict of interest (Q10), subjectivity |
| — | AI moderation | Rejected | A model decides about money based on text and files from the student |

**Where M3b came from.** The idea of tracking opened lessons is mine; it came up after the platform
research (Udemy refuses when "a significant portion has been consumed"). It is a passive signal: the
lesson completion logic and the "Complete" button do not change. There is already a place to collect
it: opening a lesson calls `touchLastAccessed` (`server/services/lesson/lesson.service.ts:155`), but
only one date per course is stored (`Enrollment.lastAccessedAt`, `prisma/schema/enrollment.prisma:23`),
not which lessons were opened.

### Matrix

Scale: ++ = 2, + = 1, − = −1, −− = −2; in brackets — score × weight. The scores were filled in by AI
based on the facts below; I checked them and changed K4 for M3b from + to ++.

| Option | K1 ×1 | K2 ×2 | K3 ×3 | K4 ×3 | K5 ×2 | Total |
|---|---|---|---|---|---|---|
| M2 | ++ (2) | ++ (4) | ++ (6) | **−− (−6), veto** | ++ (4) | 10 → eliminated |
| M3a | ++ (2) | + (2) | + (3) | − (−3) | − (−2) | **2** |
| M3b | ++ (2) | + (2) | + (3) | ++ (6) | −− (−4) | **9** |

**Facts behind the scores:**
- **K1:** all three options give an instant decision; only appeals reach the admin. The criterion
  does not distinguish the options.
- **K2:** M2 — no admin (only exceptions via the admin panel, C3.1); M3a / M3b — appeals only.
- **K3:** M2 — two rules determine the decision; M3a / M3b — rules with numeric thresholds + a human on
  appeals.
- **K4, test — the student read the course and did not press "Complete" (F4):**
  - M2 — gets the money: progress is not checked at all, it lets through everyone without a certificate;
  - M3a — gets the money if they did not use quizzes / the tutor and this is the first refund; account
    history only catches repeat abuse;
  - M3b — caught: to read a lesson you have to open it. Limits: "opened" ≠ "read";
    purchases before launch have no view history (like S2).
- **K5:** M2 — `refunds.create` + window and certificate check; M3a — + heuristic, refund
  history, appeal flow with an admin screen; M3b — + schema change, write on lesson open,
  migration.

**Sensitivity check:**

| Change | M3a | M3b | Winner |
|---|---|---|---|
| As is | 2 | 9 | M3b |
| K5 weight = 3 | 1 | 7 | M3b |
| K5 weight = 1 | 3 | 11 | M3b |

Without the veto M2 would win (10 vs 9) — the decision depends on K4 being a veto, not a weight. With
the veto M3b wins at any K5 weight.

### Decision

**M3b:** automatic decision by the Q12 rules + account-level limits + tracking of opened lessons;
the admin reviews only appeals against auto-refusals.

- **What I give up:**
  - Simplicity of implementation (compared to M2): it needs a heuristic, refund history, an appeal
    flow, a schema change and a migration. I accept it, because K4 is a veto: the simple option lets
    abuse through automatically.
  - Individual review (compared to M4): an honest student who opened more than 3 lessons because the
    course really is empty will be refused by the automation. I accept it, because reviewing every
    refund request overloads the admin (K2), and an appeal fixes a wrong refusal.
- **I will revisit if**, for 4 weeks in a row, at least one of these holds:
  - **more than 10 appeals per week.** Derived: the admin has 2.5 h/week, ~15 min per appeal
    (read the reason, review the evidence and history, write the mandatory refusal reason — C5.2).
    More than that — the queue grows, the 14-day SLA is at risk;
  - **the share of appealed auto-refusals is twice the baseline.** I measure the baseline in the first
    4 weeks after launch. The ×2 multiplier is a "significant change" convention, not a measurement. I
    do not set a fixed percentage: there is no data, and industry benchmarks (chargeback share)
    measure something else.

  The admin's time and the time per appeal are assumptions: there are no real users. "4 weeks in a
  row" — so that a single spike does not trigger a revisit.

### What this changes in earlier decisions

| Decision | Was | Now (2026-11-15) |
|---|---|---|
| Q10 | Admin approves, "preliminary" | Closed: M3b |
| C5.1, A9 | Model (b): Q12 is a filter, the admin decides on the evidence | The admin sees only appeals. **Evidence — only on appeal**; the submission form has only the reason |
| C4 | Maximum 2 refund requests | **One refund request per course**; after submission the button is disabled. Then — automatic decision → **one appeal**. The "two attempts" logic from C4.1 is built into the flow: the refund request (reason only) is the first attempt, the appeal (reason + evidence) is the second. One, so that the student thinks about what exactly they are adding and there is no long back-and-forth. **Appeal deadline** = the later of: end of the window or auto-refusal + 3 days — the student always has at least 3 days, and waiting until the last day does not pay off (rejected: "3 days only when submitted on the last day" — gave more time to those who stalled). Consequence for the instructor: worst-case hold = window + 3 days + review (≤ 14 days) → close in A3 |
| S3 | Form with reason and files | Files only at the appeal step → smaller attack surface (`security-auditor` at `/spec`) |
| C1.2 | Money is held until the admin's decision | Most decisions are instant; the hold is bounded by the window and appeals |

## Q13 — progress threshold

*2026-11-15. The number, the rationale and the choice of formula — mine; dev-DB data, formulas A / B
and the advice — AI.*

**Decision:** a refund is possible if the student has **opened** no more than `min(3, ⌊L/2⌋)` lessons,
where L is the number of non-deleted lessons in the course **at the time the refund request is
submitted**.

| Lessons in the course (L) | Allowed to open | Share of the course |
|---|---|---|
| 1 | 0 | 0% |
| 2 | 1 | 50% |
| 3 | 1 | 33% |
| 4 | 2 | 50% |
| 5 | 2 | 40% |
| 6+ | 3 | ≤ 50% |

### Rationale

- **Why 3.** Before purchase the student sees only the trailer (`Course.previewVideoUrl`,
  `prisma/schema/course.prisma:26`); there are no free preview lessons, so they can evaluate the course
  only after paying. In all 7 courses in the dev DB the first two lessons are intro and setup ("What
  is X?", "Setting Up Your Environment"). The third lesson is the first substantive one: it shows how
  the instructor presents material, whether it is clear and whether you want to continue (the Q1
  reasons). *Caveat: this is seed data, not real courses.*
- **Why no percentage.** The time needed to evaluate a course does not depend on its length: the intro
  is the same. A percentage would give a long course more "free" lessons for no reason.
- **Why `⌊L/2⌋` for short courses.** Never more than half the course. A 1-lesson course cannot be
  consumed in full and refunded. Rounding down is built into the formula.
- **Why opening, not "Complete".** "Complete" is a mark set by the student; they can just not press it
  (A2 F4). Opening a lesson is a necessary condition for consuming it.
- **Why the denominator at submission time.** The instructor can add or delete lessons after purchase
  (A2 F6); we fix the state on which the student based their decision.

### Rejected

| Option | Why |
|---|---|
| 60–70% | The student gets most of the course for free; legalised abuse |
| N = 2 | Both first lessons are intro; the student uses up the limit without seeing any content |
| N = 2 + 20% | The percentage had no rationale; on 28 lessons it gave 5–6 lessons |
| Separate rule "≤ 3 lessons → 1" | Breaks on a 1-lesson course (100%) |
| Formula A: `min(3, L − 1)` | On 3–4 lesson courses it gives away 67–75% of the content |
| Threshold by duration | We count progress in lessons (A2); mixing units is needless complexity |

**Revisit condition.** The threshold can be wrong in both directions; I measure both, because
complaints from honest students are visible and quiet abusers are not, and with only one side measured
the threshold would only ever get softer. I will revisit Q13 if, for 4 weeks in a row:
- **the admin overturns more than 50% of threshold-based auto-refusals** → the threshold is too strict.
  50% is derived by logic, not convention: above it the rule is wrong more often than right;
- **or among approved refunds, the share of "opened exactly as many as the threshold allows" is twice
  the baseline** (first 4 weeks) → students are gaming the limit, the threshold is too soft or too
  predictable. The ×2 multiplier is a convention.

**Requirement for the Specification:** an auto-refusal records **which Q12 condition** caused it
(window, threshold, certificate, account limit) and how many lessons were opened at submission time —
otherwise the revisit condition cannot be measured.

**Known limits:** the dev DB has no courses shorter than 15 lessons, so for all existing courses the
threshold = 3; the formula for short courses protects the edge, not a real case. "Opened" ≠ "read".

## A3 — refund window length

*2026-11-15. The "14 instead of 30" hypothesis — mine. Searching for Stripe constraints, analysing the
criteria, option V4 and filling in the matrix — AI; weights, choice, "what I give up" and the revisit
condition — agreed by me.*

**Inputs:** counted from payment (Q14); the instructor's money is held until the end of the window
(Q18), and on appeal — up to 3 more days + review up to 14 days (A1, C4); the student needs 3 lessons
to evaluate (Q13).

**Constraints the decision does not determine:**
- Stripe's limit on refunding an old payment (E10): no official page found; third-party sources
  say 180 days ([drchrono](https://support.drchrono.com/home/pdfexport/id/668c7b945487e4c1a708ade6)) —
  **not verified**, but it does not constrain a window ≤ 30 days.
- A chargeback is possible up to 120 days regardless of the window
  ([Stripe](https://stripe.com/resources/more/chargeback-time-limits-in-the-uk)): no option closes the
  Q9 risk after the payout.

### Criteria and weights

| # | Criterion | Weight | Why |
|---|---|---|---|
| K1 | The student has enough time to evaluate the course | 2 | Counted from payment: the student may not start studying right away |
| K2 | How long the instructor waits for the money | 2 | The direct cost of Q18; in A1, K1 = 1 was accepted on condition that A3 shortens the window |
| K3 | Appeal of the guarantee for sales | 1 | Q11 — an assumption without data |

**Struck out:**
- *Kept promise* — new buyers see the new text on `/pricing`; the problem is only for old
  purchases → a transition question (below).
- *Abuse protection* — in M3b consumption is bounded by the opened-lessons threshold (Q13), not by
  time: the A1 decision decoupled abuse from the window length.
- *Complexity* — the length is a single number, the options cost the same.

### Options and matrix

Scale: ++ = 2, + = 1, − = −1, −− = −2; in brackets — score × weight.

| Option | Worst-case hold | K1 ×2 | K2 ×2 | K3 ×1 | Total |
|---|---|---|---|---|---|
| V1 — 7 days from payment | 24 days | − (−2) | ++ (4) | − (−1) | 1 |
| **V2 — 14 days from payment** | 31 days | + (2) | + (2) | + (1) | **5** |
| V3 — 30 days from payment | 47 days | ++ (4) | −− (−4) | ++ (2) | 2 |
| V4 — 14 days from the first opened lesson, no later than 30 from payment | 47 days | ++ (4) | − (−2) | + (1) | 3 |

Worst-case hold = window + 3 days for appeal + 14 days of review. V4 changes the Q14 decision and makes
the hold unpredictable; the date of the first lesson opening will already be collected for M3b.

**Sensitivity check:**

| Change | V1 | V2 | V3 | V4 | Winner |
|---|---|---|---|---|---|
| As is | 1 | 5 | 2 | 3 | V2 |
| K1 = 1 | 2 | 4 | 0 | 1 | V2 |
| K3 = 2 | 0 | 6 | 4 | 4 | V2 |
| K2 = 1 | −1 | 4 | 4 | 4 | tie V2 / V3 / V4 |

14 days holds on the premise that the instructor's wait matters (K2 = 2).

For reference, not as evidence: 14 days — at Coursera, Teachable, Domestika and the EU withdrawal
period; 30 — at Udemy (see A1, "How platforms do it").

### Decision

**V2: 14 days from payment.**

- **What I give up:**
  - Compared to V3 (30 days): a student who started studying more than a week after purchase has
    little time to evaluate; I also lose the appeal of a 30-day guarantee. I accept it, because the
    instructor would wait up to 47 days, and that a longer guarantee sells better is only an
    assumption (Q11).
  - Compared to V4 (14 days from start): fairness to those who buy in advance. I accept it, because
    the money hold becomes unpredictable (up to 47 days), and the Q14 decision would have to be
    reopened.
  - Compared to V1 (7 days): the instructor waits longer (31 days vs 24 in the worst case).
    I accept it, because 7 days takes away the refund right from those who did not start studying
    right away.
- **I will revisit if**, for 4 weeks in a row, the share of auto-refusals "only because of the window"
  (window passed, opened ≤ threshold lessons) is twice the baseline (first 4 weeks): students do not
  manage to start studying → consider V4. The opposite side (window too long) I do not measure: its
  cost — the hold of the instructor's money — is known up front, not from data. The measurement relies
  on the requirement from Q13 (an auto-refusal records the reason and the number of opened lessons).

### Transition question: old purchases (Q15)

**Q15 confirmed (2026-11-15):** the new rules, including the 14-day window, also apply to purchases
made before launch. The trust risk is accepted deliberately, as in Q15 of 04.11.

Consequences to account for in the Specification:
- a purchase made more than 14 days before launch loses the refund right at the moment of launch,
  although under the old promise it would have had up to 30 days;
- the text on `/pricing` (Q20) must change in the same release (AI finding R8);
- the instructor's shares for old purchases are already `transferred` — the Q18 hold does not apply to
  them (S2, a separate question in the queue).

## A8 — who bears the Stripe fee (Q17)

*2026-11-15. Facts from the code, options, matrix and the revisit-condition formula — AI; weights,
veto, the K2 score for V2, the decision and the 5% threshold — mine.*

### Facts

- The student pays exactly the course price (`server/services/payments/payment.service.ts:82-92`).
- The 20/80 split is computed from the full price (`computeSplit`, `lib/platformFee.ts`); the Stripe
  fee is not accounted for in it — it is borne entirely by the platform's share.
- Stripe does not return the fee of the original payment; the card refund itself is free (Q17).
- Because of Q18, the instructor's share on a refund within the window is not clawed back via a
  reversal but cancelled (C2.1).

| On a $50 example (fee ~$1.75, US rate) | Sale | Refund within the window |
|---|---|---|
| Student | −$50 | +$50 |
| Instructor | +$40 after the window | $0, transfer cancelled |
| Platform | +$8.25 | −$1.75 |

### Criteria and weights

| # | Criterion | Weight | Why |
|---|---|---|---|
| K1 | Platform loss on a refund | 1 | ~2% of platform revenue at 10% refunds; the refund share is an assumption |
| K2 | Fairness to the instructor | 2 | The instructor is a party with their own need (value table) |
| K3 | Promise of a full refund | **veto** | Q16 and S1 are already decided: full refund only |
| K4 | Complexity | 2 | The deadline is real |

**Scope is not a veto (my decision):** changing the fee split on all sales is considered within the
Refund feature.

### Options and matrix

Scale: ++ = 2, + = 1, − = −1, −− = −2; in brackets — score × weight.

| Option | K1 ×1 | K2 ×2 | K4 ×2 | Total |
|---|---|---|---|---|
| **V1 — the platform bears the fee (as now)** | −− (−2) | ++ (4) | ++ (4) | **6** |
| V2 — the fee is split 20/80 on every sale | + (1) | − (−2) | − (−2) | −3 |
| V3 — the instructor bears a share of the fee only on refunds | + (1) | −− (−4) | −− (−4) | −7 |
| V4 — the student bears the fee (price minus fee is refunded) | — | — | — | eliminated by the K3 veto |

- **K2, V2 — "−":** the instructor pays ~80% of the fee on every sale, terms get worse for everyone
  (the alternative reading "a proportional split is fair" was considered and rejected).
- **K4, V2:** the exact Stripe fee is known only after the payment (it depends on the country and card
  type), so we would need to fetch the actual fee from Stripe and update Revenue, statistics and the
  instructor terms.
- **K4, V3:** a new instructor-debt mechanism with deductions from future payouts.

**Sensitivity check:**

| Change | V1 | V2 | V3 | Winner |
|---|---|---|---|---|
| As is | 6 | −3 | −7 | V1 |
| K4 = 1 | 4 | −2 | −5 | V1 |
| K2 = 1 | 4 | −2 | −5 | V1 |
| K1 = 3 | 2 | −1 | −5 | V1 |

V1 is robust. V2 would win only with K1 = 3 and a "+" score for V2 on K2 — both rejected.

### Decision

**V1: the platform bears the Stripe fee, the split does not change.** A deliberate "change nothing"
decision, not an omission.

- **What I give up:** compared to V2 — the platform loses the whole fee
  (~$1.75 on $50) on every refund, not just its share (~$0.35). I accept it, because the loss is small
  (~2% of platform revenue at 10% refunds), and V2 worsens the instructor's terms on all sales and
  needs the actual fee from Stripe.
- **I will revisit if**, for 4 weeks in a row, Stripe fees on refunded payments exceed **5% of
  platform revenue** (sum of `platformFeeCents` over the same period). The 5% threshold is my decision
  about an acceptable loss. I measure the loss directly, not the refund share: the share at which the
  loss reaches 5% depends on the course price (for $50 — ~24%, for $20 — ~18%), because the Stripe fee
  has a fixed part of $0.30.

**Consequence for the Specification:** store the actual Stripe fee per payment (from the balance
transaction), otherwise the revisit condition cannot be measured.

## S2 — old purchases during the transition period

*2026-11-15. Analysis of transfer states, options and the comparison — AI; the rejected options, the
decision and the "compare two instead of a matrix" format — mine.*

### What the question is about

Because of Q15 (new rules for everyone) and the 14-day window (A3), at the moment of launch only
purchases from the last 14 days before launch have a refund right. The Q18 hold did not yet apply to
them:

| Transfer state | What happens on a refund | Who closes it |
|---|---|---|
| `pending` | Without a fix — bug Q8 | Already closed by C2 (cancellation on refund, check before payout — for all `pending`) |
| `transferred` | Reversal (`server/services/payments/payment.service.ts:193`); if the instructor has withdrawn the money, the platform covers the negative balance (Q9, Q25) | **This is S2** |

The risk is the instructor's share on `transferred` sales in the 14 days before launch, and only if
the instructor managed to withdraw the money. Learnix is a pet project with no real sales, so the
actual risk right now is zero; I make the decision as if there were sales.

### Options

| # | Option | Status | Reason |
|---|---|---|---|
| V1 | Accept the risk: reversal already works, the platform covers the negative balance, the risk is bounded by 14 days | Compared with V3 | — |
| V2 | Old purchases — no refund via the feature | Rejected | Contradicts Q15, confirmed in A3; breaks the old promise even more |
| **V3** | **Phased launch:** first enable only the Q18 hold, 14 days later — the refund button | **Chosen** | — |
| V4 | Old purchases — manual only, via the admin (Dashboard, E1) | Rejected | Different rules for different purchases (contradicts M3b); manual admin work in the busiest period — at launch |

I did not build a full matrix: after the rejected options two were left, and the difference between
them is a single trade-off.

### V1 vs V3

| | V1 — accept the risk | V3 — phased launch |
|---|---|---|
| Platform risk | Yes, for 14 days after launch | None: by the time the button appears, all purchases within the window are already held |
| Work | Zero | Release order: two steps, a feature flag for the button |
| Instructor | No change until launch | Starts waiting for money 14 days before students get the button |
| Transition period | 14 days with a special case (`transferred`) | None: all refunds through the feature follow one scheme |

### Decision

**V3: phased launch.** Step 1 — payout hold (Q18); step 2, 14 days later — the refund button for
students.

- **What I give up:** compared to V1 — release simplicity (two steps instead of
  one) and 14 days during which instructors already wait for money while students do not yet have the
  button. I accept it, because the whole transition period disappears: no special `transferred` case,
  and the platform does not cover instructors' negative balances.
- **Revisit condition:** not needed — the decision is one-off and applies only at the
  moment of launch. Fallback — V1, if the launch has to be done in one step.

**Consequences for the Specification / plan:**
- the refund button — behind a feature flag; the Q18 hold — no flag, enabled first;
- between the steps, manual refunds via the Dashboard (E1) remain possible — handled by C2 and E2;
- the text on `/pricing` (Q20) changes together with step 2, when the button appears.

## D2 — what to do with progress after a refund

*2026-11-15. Facts from the code, platform research, options and conflicts — AI; "from scratch", the
changed-content argument, the list of what to delete, and the choice of how to keep study time —
mine.*

**Was (A4, D2):** a repeat purchase — from scratch, clean up the data; the moment of cleanup is open.

### Facts

- A repeat purchase sets `active`, `completedAt: null`, but does not touch `LessonProgress` or the
  `Enrollment.progress` cache (`server/services/enrollment/enrollment.service.ts:73-78`) —
  progress "comes back to life" (R1–R2).
- `LessonProgress` is unique per lesson + student pair (`prisma/schema/lesson.prisma:46`), not per
  purchase.
- The student's total study time is not stored separately: `getCompletedMinutesTotals` sums the
  lessons' `duration_minutes` from `LessonProgress` each time, with no filter on enrollment status
  (`server/repositories/lessonProgress.repository.ts:57`; called in
  `server/services/student/student.service.ts:34`). Deleting progress reduces the total time.

**What today's decisions changed:** D3 (one refund per course) removes abuse via
"resurrected" progress; the snapshot of conditions at decision time (requirement from Q13) makes the
evidence independent of live data. What remains is the experience of a returning student and data
minimisation.

### How platforms do it

| Platform | On repeat purchase / enrolment | Context | Source |
|---|---|---|---|
| Udemy | From scratch: progress of a refunded course is not restored | Money refund | [Official help](https://support.udemy.com/hc/en-us/articles/235652488-Refund-Status-Common-Questions) |
| Teachable | Continues from where they left off; the owner can reset manually | Unenrolment | [Official help](https://support.teachable.com/en/articles/11682532-enroll-or-unenroll-a-student-in-a-course) |
| Coursera | Apparently kept | Unsubscribe | Reviews only, **not verified** |

There is no single practice: "from scratch" — when the purchase is cancelled (Udemy, the closest
analogue), "continue" — on a pause without a money refund. "Not restored" at Udemy does not mean
"deleted" — practice does not answer what exactly to keep.

### Options

| # | Option | Status |
|---|---|---|
| V1 | Delete on refund | **Chosen** (with the refinements below) |
| V2 | Reset on repeat purchase | Rejected: the data lies around forever for those who do not return |
| V3 | Delete nothing, tie progress to the purchase | Rejected: keeps what is not needed; schema change |
| V4 | Continue from where they left off | Rejected: changed content (below) |

### Decision

**A repeat purchase starts from scratch. The course's learning records are cleaned up at the moment
the refund is confirmed** (webhook `charge.refunded`, not an admin action: a refund can fail and be
retried, S4).

**Why from scratch (my words):** the student did 2 lessons, got a refund and buys again, and in the
meantime the material of the first lessons and the quizzes have changed. With progress kept they will
skip those lessons, and the quiz may already be different.

**Why on refund:** an appeal only happens after a refusal, so after a refund the evidence is no longer
needed (the snapshot of conditions is stored at decision time). The student may never return — the
data does not lie around forever.

| Record | Action | Why |
|---|---|---|
| `LessonProgress` | Delete | Changed content; progress does not "come back to life" |
| Opened lessons (M3b signal) | Delete | The count is already in the snapshot of conditions; limits are computed from `Payment` |
| `Enrollment.progress` | Reset to 0 | Otherwise the old percentage (R1) |
| `QuizAttempt` | Delete | Quizzes may have changed |
| AI tutor conversations for the course | Delete | Personal data, no longer needed |
| `ConceptMastery`, concept checks | **Keep** | The student learned something new — that is knowledge, it affects recommendations |
| `Payment` (`refunded`), `Enrollment` (`cancelled`), refund request + snapshot | **Keep** | Purchase trail; invoice (I7); D3 and the M3b account limits rely on this history |
| Total study time | **Preserve** | Before deletion the minutes are moved into the student's cumulative counter; total time = counter + live records |

**Alignment with D4:** D4 removes **interest** in the refunded course from recommendations (bought →
interested); ConceptMastery is **acquired knowledge**. We remove the interest, keep the knowledge.

- **What I give up:** compared to V4 — a student who returned to the same
  course with no content changes goes through already completed lessons again. Compared to V3 — the
  history of quiz attempts and tutor conversations cannot be restored. I accept it, because changed
  content makes old progress unreliable, and I do not keep data without a purpose.
- **I will revisit if:** repeat purchases after a refund become
  frequent (share twice the baseline of the first 4 weeks) and students complain about
  lost progress → consider manual restoration by the admin, as at Teachable.

**Consequences for the Specification:**
- a cumulative study-time counter (new field) and a change to `getCompletedMinutesTotals`;
- what happens to the weekly charts (`getDailyCompletedMinutes`) if the refund happened in the current
  week — decide in the specification;
- cleanup — in the same `charge.refunded` handling as the transfer cancellation (C2.1); idempotent,
  because the webhook can arrive again (M5).

## C2.4 — atomic transfer state transition

*2026-11-15. Facts from the code, mechanism options and the recommendation — AI; the choice and the
decision to fix the latent bug within the feature — mine.*

**Requirement (from C2):** a refund (cancel the held transfer) and the payout after the window can
happen simultaneously for the same payment. `pending` can be left for only one state — whoever is
first wins.

### Facts

| # | Fact | Where |
|---|---|---|
| T1 | Transfer: read the payment → `transfers.create` in Stripe → write `transferred`. Nothing between the read and the write blocks another process | `server/services/payments/connect.service.ts:118-165` |
| T2 | There is no idempotency key anywhere in the code: two simultaneous calls for one payment = two transfers in Stripe | `grep idempotencyKey` → 0 |
| T3 | `sweepPendingTransfers` is triggered from the `account.updated` webhook; two close events → two parallel sweeps transfer the same `pending`. **A latent bug, independent of Refund** | `connect.service.ts:167-193` |
| T4 | The Next.js app itself has no scheduler (no cron routes, no job queue). **Corrected 2026-11-15:** an external scheduler exists — self-hosted n8n with a daily cron that calls the Learnix API with a Bearer token (ADR-014). Who triggers the payout after the window (Q18) is a separate question, T4 | `app/api/`; `package.json`; `docs/adr/014-n8n-lifecycle-automations.md` |

### Options

| # | Mechanism | Status | Reason |
|---|---|---|---|
| **V1** | **Conditional update (compare-and-set) + intermediate state `transferring`** | **Chosen** | Postgres provides atomicity; no new infrastructure; network call outside the transaction |
| V2 | Row lock (`SELECT … FOR UPDATE`) for the duration of the Stripe call | Rejected | Transaction open during a network call — an anti-pattern |
| V3 | Advisory lock in Postgres | Rejected | Same as V2; harder to debug |
| V4 | Distributed lock in Redis | Rejected | Money consistency depends on a second system |
| V5 | One queue for all transfer operations | Rejected | There is no queue (T4); the most new infrastructure |

### Decision

**V1 + Stripe idempotency key.**

- **Payout:** `UPDATE … SET transferStatus = 'transferring' WHERE id = ? AND transferStatus =
  'pending'` → 1 row — claimed it, goes to Stripe; 0 — someone already claimed it, exit. After success →
  `transferred`.
- **Refund:** `UPDATE … SET transferStatus = 'cancelled' WHERE id = ? AND transferStatus =
  'pending'`. If 0 rows because the payment is already `transferring` — after a successful transfer the
  payout checks `payment.status` and, if `refunded`, immediately does a reversal (the existing mechanism).
- **Idempotency key** for `transfers.create`, derived from the payment ID. A second layer of protection:
  Stripe does not transfer twice even if our guard failed or the call was retried after a crash.
- **New `TransferStatus` states:** `transferring`, `cancelled` (C2.1).
- **The latent bug T2/T3 is fixed within the feature** — the idempotency key closes it.

- **What I give up:** compared to V5 — races are not ruled out by construction, they
  have to be thought through in every place that changes the transfer state. A `transferring` state
  appears, in which a payment can get stuck after a crash. I accept it, because a stuck payment is safe
  to retry (idempotency key), and a queue is new infrastructure.
- **I will revisit if:** payments appear that are stuck in
  `transferring` for longer than one retry cycle (any such case is a signal that recovery does not
  work), or if a job queue appears anyway for T4 — then V5 stops being expensive.

**Consequences for the Specification / plan:**
- `TransferStatus` migration: + `transferring`, `cancelled`;
- recovery of stuck `transferring` (retry with the same key);
- race tests: refund ↔ payout, two parallel sweeps, repeated webhook;
- ADR: money + consistency mechanism.

## T4 — who triggers the payout after the window closes

*2026-11-15. Facts from the code, checking the Stripe and Vercel docs, options and design — AI;
dropping n8n and Stripe payout settings, choosing Vercel + Redis, the contents of the admin panel and
the email — mine.*

**Task:** per Q18 the instructor's share is held until the end of the window (14 days, A3) or until
the decision on the refund request (C1.2). Something has to trigger the payout when the hold ends.

### Facts

- The Next.js app has no scheduler: no `vercel.json`, no cron routes, no job queue.
- n8n is switched off (commit `b9c2f7d`): everything was moved into the project to avoid paying for a
  server. ADR-014 still has status Accepted — a mismatch between docs and code (a separate edit).
- `@upstash/redis` is already present (AI rate limiter).
- **The admin panel already has a Sweep button** (`app/(admin)/admin/SweepButton.tsx` →
  `sweepAllPendingTransfers`, `server/api/routers/payment.ts:133`): it transfers **all** `pending`. After
  Q18 it would pay out held money before the window closes and for refunded sales — a second path to bug
  Q8 bypassing C2 / C2.4.

### Check: can the hold be done on Stripe's side

Stripe documentation (`stripe docs`, [Manage payout schedule](https://docs.stripe.com/connect/manage-payout-schedule),
[Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)):

- `delay_days` applies only to "on_behalf_of charges (or direct charges performed on the connected
  account)". We use separate charges and transfers without `on_behalf_of` (not used in the code),
  so it does not apply to our transfers. It is set by the platform (not the instructor), max 31 days.
- The `manual` payout interval keeps money on the instructor's balance, but someone still has to
  trigger the payouts — a scheduler is needed.

| | Hold on the platform + cron | `delay_days` | `manual` payouts |
|---|---|---|---|
| Works with our payment model | Yes | No — requires `on_behalf_of` (different settlement country, fees, statement — an ADR-019 change) | Yes |
| Scheduler needed | Yes | No | Yes |
| Consistency with Q18, C2, C2.4 | Unchanged | Breaks C2.1, C2.4 | Breaks C2.1 |

**Conclusion:** holding via Stripe is rejected.

### Scheduler options

| Option | Status | Reason |
|---|---|---|
| **Vercel Cron** | **Chosen** | Free on the platform where the app lives |
| n8n cron | Rejected | The service was switched off to avoid paying for a server |
| GitHub Actions on a schedule | Rejected | CI as a production scheduler; exact timing not guaranteed |
| Lazily, on the next event | Rejected | An inactive instructor would never get paid |
| `node-cron` in Next.js | Rejected | On Vercel the process does not live permanently |
| Upstash QStash | Rejected | Yet another service |

### Vercel Cron: what was checked in the docs

| Property | Documentation | How it is accounted for |
|---|---|---|
| Frequency on Hobby | Only once a day | Enough |
| Precision | "±59 min", UTC | Payout on day 14–15; "window closed" is computed in UTC |
| Protection | `CRON_SECRET` → `Authorization: Bearer <CRON_SECRET>` | Constant-time comparison; variable in `lib/env.js` |
| Retries | "Vercel does not retry a failed invocation"; delivery is "best effort" | State-based selection: the next run picks up everything missed (Vercel itself recommends "reconciliation-based") |
| Double invocation | "May invoke the same run more than once" | Conditional update (C2.4) + idempotency key |
| Overlap | "May start a second instance while the first is running"; Redis locking is recommended | Redis `SET NX` with TTL |
| Duration | 300 s max on Hobby | Limit of payments per run (number — Specification), the rest the next day |
| Environment | Production only; GET; redirects are not followed | Manual run for dev; `next.config.ts` has no `trailingSlash`, there is no middleware |
| Logs | Hobby — 1 hour | We store the run result ourselves (DB) |
| Status | Cron is legacy, moving to Schedules (beta) | Name the risk in the ADR |
| Commercial use on Hobby | **Not verified** (the terms page did not open) | Check before a real launch with money (like F7) |

Sources: [Cron jobs](https://vercel.com/docs/cron-jobs),
[Managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
[Usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[Functions limitations](https://vercel.com/docs/functions/limitations),
[Hobby plan](https://vercel.com/docs/plans/hobby).

### Decision

**Vercel Cron daily → `GET /api/cron/release-payouts`:**

1. `CRON_SECRET` authorization.
2. Selection **by state**: all held payments whose window is closed and that have no active refund
   request or appeal (C1.2).
3. For each payment: conditional update (C2.4), check the charge in Stripe (C2.3), transfer with an
   idempotency key.
4. Limit of payments per run.
5. Redis — only for the run lock.
6. The same cron — for the S7 reconciliation.
7. **The result of every run — in the DB** (new runs table): time, processed, errors, payment IDs.
8. **Email to the admin** (Resend, already present) on errors and if there has been no successful run
   for more than 48 hours.
9. **The Sweep button is replaced with "Run job now"** — same code, same checks.

**"Payouts" admin panel — four blocks:**

| Block | View | Action |
|---|---|---|
| Job status | Last run, processed / errors; red warning if > 48 h without success | "Run now" |
| Run history | Runs over the last N days | — |
| Problem payments | Stuck in `transferring`, Stripe errors with text | "Retry" per payment (S4) |
| Held funds | How much is held, how much will be released in the coming days | — |

- **What I give up:** compared to holding on Stripe's side — new
  infrastructure in the project (cron, runs table, admin panel, email) and precision to the day. Compared
  to a job queue — on Hobby no more than one run per day, so a missed run delays payouts by
  a day. I accept it, because the Stripe options do not work with our payment model or need a
  scheduler anyway, and a one-day delay after a 14-day window is insignificant.
- **I will revisit if:** there is no successful run for more than 48 hours more often
  than once a month, or the run regularly hits the payment limit (the queue grows day after day) —
  then the Pro plan (more frequent runs) or Vercel Workflows.

**Addendum 2026-11-16 (found by AI while drafting ADR-037, agreed by me):** besides the Sweep button,
held money would be paid out by two more paths — `account.updated` → `sweepPendingTransfers`
(`app/api/stripe/webhook/route.ts:74`) and the immediate transfer in `finalizeCheckout`
(`payment.service.ts:124,162`). **All payout paths go through one "OK to pay out" condition**;
there is no longer a transfer at the moment of sale.

**Consequences for the Specification / plan:** `vercel.json` with cron; `CRON_SECRET` in `lib/env.js`;
runs table (migration); replacement of `sweepAllPendingTransfers`; "Payouts" admin panel; email
template for the admin; the new endpoint and admin procedures — in the `security-auditor` scope at
`/spec`.

## S7 — reconciliation with Stripe if the webhook did not arrive

*2026-11-15. Facts from the code and docs, options and the recommendation — AI; approving the analysis
and the choice — mine.*

### Facts

| # | Fact | Source |
|---|---|---|
| W1 | The refund status is changed only by the `charge.refunded` webhook; without it: money refunded, access open, payment `succeeded` | `app/api/stripe/webhook/route.ts:55-64` |
| W2 | Stripe retries delivery for up to 3 days in live; in sandbox — 3 times over a few hours | `stripe docs /webhooks` |
| W3 | Events are available via the API up to 30 days back (`GET /v1/events`) | `stripe docs api GET /v1/events` |
| W4 | Deduplication by `event.id` already exists (`ProcessedStripeEvent`) | `route.ts:44` |
| W5 | Event handling is right in the route (`switch`), not in a service | `route.ts` |

**What M3b changed:** the main path — Learnix itself calls `refunds.create`; the response is
synchronous, so the consequences can be applied immediately. S7 remains for refunds via the Dashboard
(E1) and for refunds that failed later (S4b).

### Options

| # | Option | Status | Reason |
|---|---|---|---|
| **V1** | **Replay events via the Events API in the daily cron through the same handler** | **Chosen** | One logic for webhook and reconciliation; deduplication already exists; one request per day |
| V2 | List of refunds (`GET /v1/refunds`) in cron | Rejected | A second logic next to the webhook — they will diverge over time; failed refunds separately |
| V3 | Check the charge state of every payment | Rejected | N requests daily; runs into the 300 s limit (T4) |
| V4 | No reconciliation (Stripe retries + C2.3) | Rejected | Financially safe, but "money refunded, access open", D2 does not clean up |

### Decision

1. **Synchronously:** after a successful `refunds.create` the consequences are applied immediately,
   without waiting for the webhook. A webhook that arrives later applies nothing a second time (C2.4,
   D2, W4).
2. **Reconciliation:** the daily cron (T4) reads `charge.refunded` events and failed-refund events
   since the last processed point and runs them through the same handler as the webhook.

- **What I give up:** compared to V2 — dependence on the 30-day event
  retention: if the cron does not work for more than 30 days, some events cannot be recovered. I accept
  it, because the email to the admin about downtime over 48 hours (T4) fires long before that.
- **I will revisit if:** the reconciliation even once finds an event that the webhook did not
  deliver and Stripe did not retry — that is, if the webhook is unreliable more often than expected;
  then check the Stripe endpoint settings.

**Consequences for the Specification / plan:**
- move event handling out of `route.ts` into a service called by both the webhook and the cron (W5);
- the "last processed event" cursor (time or ID) — store in the DB together with the run result (T4);
- a failed-refund handler (`refund.failed` / refund status update) — for S4b;
- in sandbox Stripe retries the webhook for only a few hours — test the reconciliation with tests, not
  by waiting.

## E2 — certificate revocation

*2026-11-15. Facts from the code, options, risks of a public page and the repeat-purchase case — AI;
the choice of V3, the verification-page idea, moving it into a separate feature, the list of reasons
and the choice of "b" — mine.*

**Context:** through Learnix things never get as far as a certificate (Q12 blocks the refund request).
Revocation is needed only for refunds via the Dashboard (E1/E2) and an admin exception (C3.1).

### Facts

| # | Fact | Where |
|---|---|---|
| K1 | There is no separate certificate entity: certificate = `Enrollment.completedAt != null` | `server/services/certificates/certificate.service.ts:15` |
| K2 | The certificate list does not filter by status — after a refund the certificate is visible | `server/repositories/enrollment.repository.ts:97-99` |
| K3 | The PDF by token does not check the status either | `app/api/certificates/[enrollmentId]/route.ts`; `certificate.service.ts:12-15` |
| K4 | A repeat purchase clears `completedAt`; purchase is blocked only by `active` / `completed` | `server/services/enrollment/enrollment.service.ts:73-78`; `payment.service.ts:58-63` |
| K5 | There is no public certificate verification page | search in `app/` |

**Decision boundary:** an already downloaded PDF cannot be revoked. "Revocation" = stop showing and
issuing it in Learnix; for third parties it will only work together with the verification page.

### Options

| # | Option | Status | Reason |
|---|---|---|---|
| V1 | Clear `completedAt` on refund | Rejected | Loses the fact of completion — part of the "purchase trail" (D2) and information for the C3.2 check |
| V2 | Filter by status (`status ≠ cancelled`) | Rejected | Sufficient only without a verification page and without other revocation reasons |
| **V3** | **Explicit revocation field + reason on `Enrollment`** | **Chosen** | Clear audit; the data the future verification page will rely on |

### Decision

**V3:** on `Enrollment` — `certificateRevokedAt` and a revocation reason; the certificate list and the
PDF do not show revoked ones.

| Question | Decision |
|---|---|
| When it is revoked | Two cases: refund via the Dashboard (E2) and admin exception (C3.1) |
| Reason | Closed list: "refund via the Dashboard", "admin exception" |
| Repeat purchase after revocation | **Allowed; the revocation is cleared** together with `completedAt` (option "b"). The student starts from scratch (D2) and can earn a new certificate. The revocation history stays in the refund record (C3.2 audit) |

Rejected for repeat purchase: (a) forbid purchase after revocation — locks out a student
who was refunded because of a platform error (e.g. wrong price, C3.1); (c) keep the
revocation — the student completes the course again but never gets a certificate.

**The certificate view and verification page is a separate feature (my decision).** It has its own
problem (an employer verifies the authenticity of any certificate, not just refunded ones) and its own
security-review: a public page without sign-in shows personal data (name, course, date), and a URL on
`enrollmentId` opens up ID enumeration. Refund only creates the "revoked" data it will rely on.

- **What I give up:** compared to V2 — a new field and a migration, and the information
  partly duplicates the status. I accept it, because the verification page will need an explicit
  "revoked, when and why", and the status does not provide that.
- **I will revisit if:** a third revocation reason appears (e.g.
  plagiarism) — the list is extended; or it is decided not to build the verification page — then V3 can
  be simplified to V2.

### Open questions for the Specification

- **Double charge:** if the student was charged twice for the same course and the admin refunds one
  payment, `handleRefund` will cancel the enrollment even though the second payment is valid
  (`payment.service.ts:167-195`). **Decided 2026-11-16 → §DC below.**

## A6 — how the instructor sees held money

*2026-11-16. Facts from the code, the three options and the recommendation — AI; the choice of V2 and
"the instructor does not see refund requests" — mine.*

**Context:** after ADR-037 every sale sits in `pending` for 14 days. Today `pending` means only "the
instructor has not connected Stripe", so an onboarded instructor sees 0 there.

### Facts

| # | Fact | Where |
|---|---|---|
| F1 | The instructor sees one "pending" amount in two places: "Pending Payout" on Revenue and "Pending (owed)" in payout settings | `app/_components/Instructor/Revenue/components/RevenueSummaryCards/index.tsx:33-35`; `app/_components/Account/PayoutsSection/components/EarningsTable.tsx:17-18` |
| F2 | Both are the sum of `transferStatus = "pending"` | `server/repositories/payment.repository.ts:49-55` |
| F3 | `getOwedBalance` does not filter by `payment.status`: a refunded sale still in `pending` is shown as owed (the UI side of D-5). After ADR-037 a refund moves it to `cancelled` | `payment.repository.ts:49-55` |
| F4 | ADR-037 adds no "held" status: (a) window open, (b) window closed but Stripe not connected, (c) open refund request or appeal — all are `pending` | ADR-037 §1–2 |

### Options

| # | Option | Status | Reason |
|---|---|---|---|
| V1 | Leave one "Pending" amount | Rejected | For 14 days the instructor sees money "pending" without knowing why |
| **V2** | **Two amounts: "On hold until the refund window closes" and "Waiting for Stripe connection"** | **Chosen** | Removes the main confusion at low cost (two aggregations) and reveals nothing about individual students |
| V3 | V2 + per-sale release date / "refund requested" in the transactions table | Rejected (for now) | More UI; shows the instructor that a specific student asked for a refund before it is decided |

### Decision

**V2.** Case (c), a sale with an open request or appeal, is counted as "on hold", with no sign of the
request. **The instructor does not see refund requests** (my decision): neither in the amounts nor in
the transactions table.

- **What I give up:** if an appeal holds a sale past 14 days, the instructor sees money "on hold"
  longer than expected and does not know why.
- **I will revisit if:** instructors ask when a specific sale will be paid out — then V3 without the
  request marker.
- **Acceptance note:** a refunded sale is never shown as owed (F3).

## DC — double charge for the same course

*2026-11-16. The path to a double charge, the effect on refund, the options and the recommendation — AI;
the choice of V3 + V2 — mine.*

### Facts

| # | Fact | Where |
|---|---|---|
| F1 | Checkout blocks only an `active` / `completed` enrollment. Two tabs opened before paying both pass the check and can both be paid | `server/services/payments/payment.service.ts:57-69` |
| F2 | `Payment` has no unique constraint on (`studentId`, `courseId`); `Enrollment` does | `prisma/schema/enrollment.prisma:25` |
| F3 | `handleRefund` finds the enrollment by `studentId + courseId`, not by payment, and cancels it: refunding one of two paid payments removes paid access | `payment.service.ts:178-188` |

Not verified: whether Stripe Checkout can block a repeat payment itself; whether the dev DB has duplicates.

### Options

| # | Option | Status | Reason |
|---|---|---|---|
| V1 | Expire the previous open Checkout session for the same student + course before creating a new one | Rejected (for now) | Cheap, but does not close the race when both are paid almost at once; useless without V2/V3 |
| **V2** | **`finalizeCheckout` sees another succeeded payment for the course and refunds the new one at once (`refunds.create`); a technical refund does not count as the student's one refund** | **Chosen** | The duplicate goes back without the student having to notice it and without an admin |
| **V3** | **`handleRefund` cancels the enrollment only if no other succeeded, non-refunded payment for the course remains** | **Chosen** | Closes the bug itself on every refund path (Dashboard, button, V2) |

### Decision

**V3 + V2.**

- **What I give up:** the Stripe fee on every auto-refunded duplicate (D-7, A8: the platform bears it).
- **I will revisit if:** duplicates show up regularly — then add V1.

## OQ-1 — opened-lesson threshold exceeded: request, no button, or appeal

*2026-11-16. The conflict between C5.3 and C4, the options and the recommendation — AI; the choice of
V3 — mine.*

**Conflict.** C5.3 (Analysis): when a condition fails, disable the button rather than accept and deny.
C4 / M3b: request → automatic decision → one appeal. Disabling the button for the threshold makes
the appeal unreachable for the only condition where the automation can be wrong ("opened" ≠ "read",
AS-5). Window, certificate and an earlier refund are facts, so no appeal is needed for them.

| # | Window / certificate / already refunded | Threshold exceeded | Status |
|---|---|---|---|
| V1 | No button | Button with a warning → automatic denial → appeal | Rejected: the system accepts a request it will certainly deny |
| V2 | No button | No button, no appeal | Rejected: an honest student with an empty course has no way out |
| **V3** | **No button** | **"Appeal to an admin" (reason + files) instead of the button, no automatic denial** | **Chosen** |

### Decision

**V3.** Changes C4: an appeal is either direct (threshold already exceeded, deadline = end of the
window) or follows an automatic denial (a condition changed between page load and submit, deadline =
the later of window end or denial + 3 days). Still exactly one appeal per course.

- **What I give up:** two entry points to an appeal instead of one; the rule "an appeal follows a
  denial" no longer holds.
- **I will revisit if:** direct appeals make up most of the admin queue — then the threshold is too
  strict (Q13).

## OQ-2 — account-level refund limit

*2026-11-16. The gap (no number behind "account-level limits" in M3b), the "sampler" scenario, the
options and the recommendation of N = 3 — AI; the choice of V2, N = 3 and counting only automatic
refunds — mine.*

**Gap.** D3 stops refunding the same course twice. Nothing stops a "sampler": buy 20 different
courses, open 3 lessons in each, refund all 20. Each refund passes every rule on its own; the platform
loses the Stripe fee 20 times (D-7). Udemy refuses on an "excessive number of refunds on the account"
but publishes no number.

| # | Rule | Status | Reason |
|---|---|---|---|
| V1 | No limit, D3 only | Rejected | The sampler passes automatically: fails the K4 veto that chose M3b |
| **V2** | **At most N automatic refunds per rolling 12 months; beyond that, a direct appeal (OQ-1)** | **Chosen** | Simple to explain and check; an honest student is passed to a human, not blocked |
| V3 | Refunds / purchases > X% after M purchases | Rejected | Two numbers without data; harder to explain |

### Decision

**V2, N = 3. Only automatic refunds count.** Not counted: duplicate refunds (DC), admin exceptions
(C3.1), Dashboard refunds, refunds approved on appeal.

- **Why 3:** caps free "sampling" at three courses a year without an admin. A **convention, not a
  measurement**: there are no users.
- **What I give up:** a student who honestly bought four unsuitable courses in a year waits for an
  admin on the fourth.
- **I will revisit if:** direct appeals triggered by the account limit are mostly approved (the limit
  is too strict), or the share of refunded purchases grows twice the baseline of the first 4 weeks
  (the limit is too soft).

## OQ-3 — do platform-initiated refunds use up the student's one refund (D3)

*2026-11-16. The wrong-price scenario, the options, the recommendation and the link to E2 — AI; the
choice of V1 and revising E2 — mine.*

**Scenario (AI's example; weakened by me in OQ-7a, see the note there).** A course is sold at $200
instead of $20 (the instructor's mistake). The admin refunds it
as an exception (C3.1). The student buys again at $20 and after 3 days finds the course unsuitable. If
the exception counted under D3, they would have no refund right without ever having used it.

| # | Rule | Status | Reason |
|---|---|---|---|
| **V1** | **D3 counts only student-initiated refunds: automatic and appeal-approved** | **Chosen** | Same logic as OQ-2: limits apply to the student's right; platform actions do not use it up. Every exception is audited with a reason (R7) |
| V2 | Every refund counts | Rejected | The student pays for the platform's mistake |
| V3 | The admin ticks "count as the student's refund" | Rejected | One more decision and audit field for the admin |

### Decision

**V1.** An admin exception (C3.1) and a Dashboard refund (E1) do **not** use up the student's one
refund of the course.

**What this changes in earlier decisions:** Analysis E2 ("a Dashboard refund counts as the one allowed
refund") is **revised**: the consequences stay the same (access, records, certificate revoked), but it
does not count under D3. Spec A5 updated.

- **What I give up:** a student whose course was refunded through the Dashboard can get one more
  refund of the same course after buying it again. Accepted: a Dashboard refund is rare (emergency
  path) and always made by the platform.
- **I will revisit if:** Dashboard refunds stop being rare, which would mean the admin uses the
  Dashboard instead of the admin panel.

## OQ-4 — notify the instructor of a refund on their sale (Q23)

*2026-11-16. Facts, options and the recommendation — AI; the choice of V1 and recording aggregated
reasons as out of scope — mine.*

### Facts

| # | Fact | Where |
|---|---|---|
| F1 | Only three notification kinds exist: certificate earned, progress near completion, new message. A new sale notifies nobody | `server/services/notifications/notification.service.ts:27,57,100` |
| F2 | The `refunded` status is already shown on Revenue | `app/_components/Instructor/Revenue/constants/statusClass.ts` |
| F3 | After ADR-037 a self-service refund happens before release: the instructor loses no money already paid | ADR-037 §1 |

| # | Option | Status | Reason |
|---|---|---|---|
| **V1** | **No notification; the status on Revenue** | **Chosen** | Consistent with no notification on a sale; nothing to claw back; the reason never reaches the instructor |
| V2 | Email without the reason | Rejected | A notification for the negative event but not for the positive one |
| V3 | Email with the reason from the list | Rejected | Pressure on the student (the A6 risk); free text may carry personal data (R6) |

### Decision

**V1.** Aggregated refund reasons per course, without students, are useful feedback for the
instructor: recorded as **out of scope**, a separate analytics feature (spec, Unsupported use cases).

- **I will revisit if:** instructors ask why their "on hold" amount dropped.

## OQ-5 — the admin misses the 14-day appeal review

*2026-11-16. The conflict with the 31-day worst case, the options, the recommendation and the Stripe
check — AI; the choice of V2 and asking for the Stripe check — mine.*

### Facts

| # | Fact | Where |
|---|---|---|
| F1 | One admin, ~2.5 h/week; with the admin unavailable, the instructor's money is held without a limit | AS-4; Analysis F6 |
| F2 | The spec promises the instructor a worst case of ≈ 31 days (window + 3 days + 14 days review); without an automatic outcome this bound does not hold | spec, Business / user value |
| F3 | The daily cron (T4) and Resend email already exist for reminders | T4 |
| F4 | Stripe documents **no age limit** for refunding a card charge. A refund draws on the available balance; if it is insufficient, it stays pending and fails after 45 days. A disputed charge cannot be refunded. The customer sees the money in ~5–10 business days | [Stripe: refunds](https://docs.stripe.com/refunds), [error codes](https://docs.stripe.com/error-codes), read via `stripe docs` 2026-11-16 |

The AI said from memory that the limit is "much larger than 31 days"; the docs do not state any limit,
so the claim is neither confirmed nor refuted. For a ~31-day-old charge there is no documented
obstacle. Balance is not a risk: the instructor's share is held on the platform (ADR-037).

| # | Option | Status | Reason |
|---|---|---|---|
| V1 | Reminders only | Rejected | The 31-day bound and the "decision by <date>" promise do not hold |
| **V2** | **Reminders on days 10 and 13, then daily; automatic approval on day 14, marked "overdue" in the audit** | **Chosen** | Keeps both promises; the platform pays for its own delay (same principle as OQ-3) |
| V3 | Reminders + automatic denial | Rejected | The student loses because of the admin; the appeal loses its meaning |

### Decision

**V2.** An overdue automatic approval counts like an appeal-approved refund for D3 (student-initiated)
but not for the account limit (OQ-2 counts automatic refunds only).

- **What I give up:** if the admin disappears, an abuser who appealed gets the money. Bounded: one
  appeal per course, and the account limit narrows who reaches an appeal.
- **I will revisit if:** any appeal is approved as "overdue": that means the admin capacity
  assumption (AS-4) failed.

## OQ-6 — warn on repurchase that the course cannot be refunded again (D3)

*2026-11-16. Options and recommendation — AI; the choice of V1 — mine.*

| # | Option | Status | Reason |
|---|---|---|---|
| **V1** | **Above the buy button: "You have already refunded this course, so this purchase cannot be refunded"** | **Chosen** | Honest; the student does not buy expecting a refund and then go to the bank (a chargeback we do not control) |
| V2 | No warning | Rejected | The student finds out only when the button is missing |

### Decision

**V1.** Shown only when the earlier refund counts under D3: automatic, appeal-approved or overdue
(OQ-5). Not shown after an admin exception or a Dashboard refund (OQ-3).

## OQ-7a — partial refund in the Stripe Dashboard (Analysis E3)

*2026-11-16. Facts and the recommendation of (c) — AI; the choice of (c), "the platform bears it" and
the note on the wrong-price example — mine.*

### Facts

| # | Fact | Where |
|---|---|---|
| F1 | Learnix supports only full refunds, but the Dashboard allows a partial one | Q16 |
| F2 | `handleRefund` treats any refund as full and cancels the enrollment: $5 back out of $100 removes the course | `server/services/payments/payment.service.ts:167-195`; D-13 |
| F3 | A partial refund is visible in the webhook: `charge.amount_refunded < charge.amount` | Stripe Charge object |

| # | Option | Status | Reason |
|---|---|---|---|
| (a) | Ignore | Rejected | Our payment says `succeeded` while Stripe says partly refunded; the instructor is paid the full share |
| (b) | Treat as full (today) | Rejected | The student loses the course over a $5 goodwill credit |
| **(c)** | **Keep access and records; record the refunded amount, flag "needs review", email the admin** | **Chosen** | Matches what the admin meant: a goodwill compensation |

### Decision

**(c). The platform bears the compensation**; the instructor's share is unchanged. It does not count
under D3 (a platform action, OQ-3).

**My note on the wrong-price case.** The student sees the price before paying. If a course costs $200
instead of $20, that is the instructor's choice and the student's choice to buy it, not a platform
error, so it is not a reason for a compensation. This weakens the example the AI used in OQ-3 and E2
("admin exception because of a wrong price"). OQ-3 still stands on its principle: platform actions do
not use up the student's right. *TODO (me): pick a better example of an admin exception for the
rehearsal (e.g. a course that turned out broken or removed after purchase).*

- **I will revisit if:** partial refunds become frequent, which would mean a real need for partial
  refunds in Learnix (Q16).

## OQ-7b — a dispute and a refund on the same payment (Analysis E8)

*2026-11-16. The two orders of events, the options and the recommendation — AI; the choice of V1 and
the request to check order 2 in the Stripe docs — mine.*

### Facts (Stripe docs, read via `stripe docs` 2026-11-16)

| # | Fact | Where |
|---|---|---|
| F1 | A disputed charge cannot be refunded: `charge_disputed` / `refund_disputed_payment`; no refund outside the dispute process while a dispute is open | [error codes](https://docs.stripe.com/error-codes); [how disputes work](https://docs.stripe.com/disputes/how-disputes-work) |
| F2 | **A fully refunded payment cannot be disputed.** A partially refunded one can, even for the full amount | [dispute best practices](https://docs.stripe.com/disputes/prevention/best-practices) |
| F3 | "You already issued a refund" is listed as evidence to counter a dispute | [dispute categories](https://docs.stripe.com/disputes/categories) |
| F4 | ADR-037 checks `disputed` before a payout, not before a refund | ADR-037 §1 |

**Order 1 — dispute, then a refund request:** Stripe refuses the second refund (F1); only the
student-facing state is missing (today it would fall into Branch C as a failure).
**Order 2 — refund, then a dispute:** for a full refund the card network does not allow it (F2), and
Learnix makes only full refunds. The double-payment risk remains only for a **partial** Dashboard
refund (OQ-7a): the student can dispute the full amount; the admin counters with the refund as
evidence (F3).

| # | Option | Status | Reason |
|---|---|---|---|
| **V1** | **Check `charge.disputed` before showing the button and before `refunds.create`; if disputed, no button and a "dispute open with your bank" message; `charge_disputed` from Stripe handled as this state, not as a failure** | **Chosen** | Closes order 1; order 2 is closed by Stripe for full refunds |
| V2 | V1 + freeze a pending request or appeal on `charge.dispute.created` | Rejected | The start of a Disputes feature (E4); V1 already catches the race at decision time |

### Decision

**V1.** Accepted risk: a dispute after a partial Dashboard refund (OQ-7a), answered by the admin in
Stripe with the refund as evidence. Disputes as a whole stay out of scope (E4).

