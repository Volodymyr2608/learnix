# AI decision log

*Translated from the Ukrainian working original on 2026-11-16; content unchanged.*

← [Spec](../spec.md)

I write entries **at the moment of the decision**, not after the fact. One entry is one AI proposal that I
verified. It covers items 9 (AI usage) and 10 (AI validation) of the IDP review.

The IDP review needs 2–3 vivid examples:
- the AI proposed the right solution, and I used it;
- the AI missed an important scenario that I found myself;
- the AI proposed an option, but after research I chose another.

**Verdicts:** `accepted` · `modified` · `rejected` · `changed-after-research` · `missed-by-ai`

## Template

```markdown
### YYYY-MM-DD — <short title>
- **Stage:** problem / discovery / analysis / specification / alternatives / decision / implementation / validation
- **Context the AI had:** <what I gave it>
- **AI proposed:** <what exactly>
- **How I verified:** <code, documentation, experiment, test — with a link>
- **Verdict:** <...>
- **Why:** <in my own words>
```

## Entries

### 2026-11-04 — The AI did not ask about holding the instructor's money
- **Stage:** discovery (step 2b/2c)
- **Context the AI had:** the prompt from the SDD guide + the Problem section and the Q1–Q12 table from
  `discovery.md`; no code and no 2a list of mine
- **AI proposed:** ~60 questions in 6 categories. On the instructor's money only P3 ("how should a
  pending transfer behave on a refund") and B4 ("who covers the fee"), i.e. questions
  about what to do *after* the money has gone out
- **How I verified:** compared with my 2a list, written down before the request
  ([`discovery.md` §2a](discovery.md)); in the AI's answer
  ([`ai-raw/discovery-questions.md`](ai-raw/discovery-questions.md)) the question
  "should the money be held for the refund window" is absent in any form
- **Verdict:** `missed-by-ai`
- **Why:** the AI thought within the current architecture (money goes to the instructor immediately) and asked how to
  fix the consequences. I questioned the architecture itself. A hold for the duration of the window removes
  both risks: the pending bug (Q8) and the reversal after the money has been withdrawn (Q9). This is now the preliminary
  decision Q18

### 2026-11-04 — The AI found directions I did not have: User Flow, Error Handling and scope ambiguity
- **Stage:** discovery (step 2c)
- **Context the AI had:** the same as in the previous entry
- **AI proposed:** questions U1–U7 (what the student sees) and E1–E5 (what breaks), plus
  ambiguity #2: "is the goal self-service, or is a working contact channel enough?"
- **How I verified:** in my 2a list the Integrations and UX categories are empty
  ([`discovery.md` §2a](discovery.md)); ambiguity #2 really was not
  resolved in any Q
- **Verdict:** `accepted`
- **Why:** this is a gap in my thinking, not an invented requirement. I was thinking about money and rules, not
  about the student's experience and failures. I closed ambiguity #2 with decision Q21, and passed U/E on to Analysis

### 2026-11-08 — The AI did research in the Stripe docs and extended the discovery document
- **Stage:** discovery (finalization)
- **Context the AI had:** the whole repository, `discovery.md`, the IDP, the Stripe documentation
  via web search
- **AI proposed:** answers to Q9 and Q17 with links; new questions Q22–Q25 (invoice after a
  refund, instructor, legal constraint, negative-balance liability config); a problem
  statement with a choice of the main problem; a value-by-party table; an "Ambiguities" section
  A1–A7
- **How I verified:**
  1. Re-read the Stripe pages linked in Q9 and Q17.
  2. Explained both facts in my own words. Mistakes that turned up during the breakdown: I thought that
     Stripe charges for the refund itself and that the original fee is paid by the student. In reality a card refund
     is free, and the fee on the original payment is paid by the seller and is not
     returned.
  3. Checked against the code: the student pays exactly the course price (`payment.service.ts:82-92`), the
     20/80 split is computed from the full price (`lib/platformFee.ts`), so the Stripe fee comes entirely out of the
     platform's share.
  4. Checked in the account: `stripe get /v1/accounts/acct_1Tiqo72LF0Z96Erz` →
     `controller.losses.payments: "application"` (Q25).
- **Verdict:** `modified`
- **Why:** the AI's facts about Stripe were confirmed, and so was its assumption "most likely the platform
  is liable": the check in the account showed exactly that. But the AI stopped at the documentation. Checking
  the code gave three things the AI did not propose: (1) the split is computed from the full price, so the loss
  on a refund is borne only by the platform; (2) an alternative — share the fee with the instructor (A8);
  (3) Express fees are also paid by the platform (`fees.payer`). That the hold (Q18) does not protect against a
  chargeback after the window was not in the research; the AI mentor found it while going through my answer. Conclusion: the documentation answers how Stripe works,
  while the answer for my product comes from the code and the account

### 2026-11-08 — A2: the AI analyzed how the system computes progress; I chose the unit
- **Stage:** analysis (A2)
- **Context the AI had:** the whole repository, the dev DB (`learnix-app-db`), `discovery.md`.
  I decided myself to count by number of lessons and asked the AI to do the code analysis for me
- **AI proposed:** eight facts F1–F8 ([`analysis.md` §A2](analysis.md)):
  `CourseProgress` is dead (my reference in Q13 was wrong); "completed" = a pressed button, not
  a view; `markIncomplete` does not update the `Enrollment.progress` cache; the denominator moves with the course;
  `durationMinutes` is filled in on all lessons. Hence the risk of bypassing Q12 (going through the course without "Complete")
  and a new question "where to take progress from for the refund request"
- **How I verified:** the re-check at my request was done by the AI mentor (2026-11-08); I made the decision
  based on it: F1 — `grep courseProgress` → only an integration test writes to the table
  (`server/repositories/user.repository.integration.test.ts`); F4 — `lesson.service.ts:176-190`:
  before the `upsert` only `getStudentLesson`, no view check; F5 —
  `syncProgressAndFireEvents` is in `markLessonComplete`, absent in `markLessonIncomplete`
  (`:276-290`); F8 — in the dev DB 0 of 145 lessons lack `duration_minutes`. *Not verified by me.*
- **Verdict:** `accepted` — the facts were confirmed; my reference to `CourseProgress` in Q13 has been fixed.
  The "by count" decision is in question after the agent's finding N4 (Part 4) — revisit at
  Alternatives
- **Why:** *(worded by AI, to confirm in my own words)* The AI found what I did not know about my own
  code: progress is the student's marks, not consumption, and so the threshold can be bypassed. The argument "duration
  is not filled in" the AI refuted with data (F8), so "by count" rests on consistency with the
  certificate (100% of lessons) and a ready formula, not on missing data

### 2026-11-08 — A4: the AI inventoried the consequences of a refund; decisions D1–D4 are mine, the AI challenged D2
- **Stage:** analysis (A4)
- **Context the AI had:** the whole repository, `discovery.md`, `analysis.md` §A2.
  I asked the AI to do the inventory and the code check for me
- **AI proposed:** a table I1–I9 and repeat-purchase findings R1–R3
  ([`analysis.md` §A4](analysis.md)). Most important: a refunded student keeps writing
  to the instructor in an existing conversation (I6); on a repeat purchase progress and the certificate "come back to life"
  (R1, R2); the number of refunds is unlimited (R3). The AI proposed no decisions — it asked me 4 questions
- **My decisions:** D1 — forbid communication; D2 — start from zero, clean up the data; D3 — one
  refund, then block; D4 — recompute recommendations
- **What the AI challenged:** D2 — deleting data on refund is irreversible and destroys the evidence of the admin's decision (Q19) and
  the statistics; proposed the alternative "reset on repeat purchase". D3 — ambiguous what
  exactly we block (the request or the purchase). Left both Open
- **How I verified:** the re-check at my request was done by the AI mentor (2026-11-08): I6 — `send()` calls only `assertParticipant` (`messaging.service.ts:119-123`), which does not look at the enrollment (`:141-151`); I5 — a review only from `completed` (`review.service.ts:23`), the rating filters only `deletedAt` (`courseReview.repository.ts:43`); I8 — `handleRefund` has no `recomputeUserInterest`; R1–R2 — a repeat purchase sets `active` and `completedAt: null`, does not touch progress (`enrollment.service.ts:73-78`); R3 — purchase is blocked only by `active`/`completed` (`payment.service.ts:58-63`). *Not verified by me.*
- **Verdict:** `accepted` — the inventory accepted in full; the AI's objection to D2 (do not delete data on refund) accepted as Open for Alternatives
- **Why:** *(worded by AI, to confirm in my own words)* On my own I would have listed access and the certificate. The AI found three things visible only in the code: a refunded student keeps writing to the instructor, a repeat purchase "brings back" progress, and the number of refunds is unlimited. I made decisions D1–D4, but D2 as I worded it would have destroyed the evidence of the admin's decision

### 2026-11-08 — A5: the AI showed that "only through Learnix" is not technically guaranteed; decisions E1–E4 are mine
- **Stage:** analysis (A5)
- **Context the AI had:** the whole repository, `analysis.md` §A2, §A4
- **AI proposed:** facts M1–M5 ([`analysis.md` §A5](analysis.md)): Learnix
  does not initiate a refund itself; the webhook handles any refund; a partial refund in the Dashboard closes
  access (contradicts Q16); disputes are not handled. Reframed A5: not "allow the Dashboard or
  not", but "what the system does with a refund that has no request"
- **My decisions:** E1 — the Dashboard stays as an emergency path, the main one is a refund from the platform;
  E2 — the same consequences, counts as one refund, the certificate is revoked; E3 — partial
  refund TBD; E4 — disputes are a separate task
- **What the AI added after my decisions:** E1 implies a double event (admin action + webhook) — a new
  requirement to link the webhook to the request; certificate revocation (E2) does not exist right now; E4 must be
  written down as a non-goal with an accepted risk, not as an omission
- **How I verified:** the re-check at my request was done by the AI mentor (2026-11-08): M1 — `refunds.create` appears 0 times in the code; M2 — `charge.refunded` is handled without checking the source (`app/api/stripe/webhook/route.ts:55`); M3 — `handleRefund` does not look at the amount (`payment.service.ts:167-196`); M4 — there are no `dispute` events in the webhook; M5 — deduplication by `event.id` (`route.ts:44`). *Not verified by me.*
- **Verdict:** `accepted`
- **Why:** *(worded by AI, to confirm in my own words)* The most valuable part is the reframing: "allow the Dashboard or not" makes no sense, because forbidding it is technically impossible. The real question is what the system does with a refund that has no request. Hence my E1–E4 and the new requirement to link the webhook to the request

### 2026-11-08 — Scenarios S1–S7: the AI carried the SDD guide's scenarios over to Learnix; the decisions are mine
- **Stage:** analysis (part 1)
- **Context the AI had:** the whole repository, `analysis.md` §A2–A5, the scenario table
  from the SDD guide
- **AI proposed:** for each scenario — what it looks like in Learnix, what the code does now, and
  questions for me ([`analysis.md` §Part 1](analysis.md)). New facts R4
  (refund without a transaction) and R5 (no refund request entity). Singled out S6(c) — the race between the window closing and
  the refund approval — as the most dangerous
- **My decisions:** S3 — one active request, a repeat one after rejection; the request is a form with a reason
  and evidence; S4 — auto-retry + manual trigger; S5 — no separate status; S6 — freeze the course for
  the duration of the review, "Complete" irreversible; S7 — reconciliation with Stripe (TBD)
- **What the AI challenged / added:** evidence makes the decision subjective versus the objective conditions of Q12 →
  new ambiguity A9; files — a new attack surface; an irreversible "Complete" changes an existing feature
  (out of scope); a limit on the number of requests. Reminded me that I had not answered S6(c)
- **Decision change (2026-11-08, the same day):** I removed freezing the course for the duration of the review (S6b). **Why:** (1) freezing the whole course widens the scope; (2) the student paid for the course — forbidding them to learn while the review is in progress is wrong; (3) while the review is in progress, the student may complete the whole course — then nothing needs refunding: the student gets the certificate, the platform and the instructor get the money. The original decision Q19 applies. The irreversible "Complete" (S6d) stays
- **How I verified:** the re-check at my request was done by the AI mentor (2026-11-08): R4 — `handleRefund` has no transaction (`payment.service.ts:167-196`); R5 — `PaymentStatus` = `pending | succeeded | failed | refunded`, there is no refund request entity (`prisma/schema/payments.prisma`). *Not verified by me.*
- **Verdict:** `accepted` — scenarios and facts accepted; the AI's objections (A9, files as an attack surface, the scope of the irreversible "Complete", the request limit) accepted as Open. The course freeze I proposed myself and rejected myself
- **Why:** *(worded by AI, to confirm in my own words)* The SDD guide's table is generic. The AI's value is that it translated it to Learnix: a "repeat request" means two requests, an admin's double click, and an admin action plus a webhook. The most dangerous turned out to be S6(c) — the race between the window closing and the refund approval

### 2026-11-08 — Contradictions C1: request inside the window, decision after it
- **Stage:** analysis (part 2)
- **Context the AI had:** `discovery.md`, `analysis.md` (A2–A5, S1–S7)
- **AI proposed:** the scenario "request on day 29, decision on day 32, window closed on day 31"
  and three questions ([`analysis.md` §Part 2](analysis.md)); candidates C2–C5
- **My decisions:** the window is counted by the moment of submission; the instructor's money is held until the
  admin's decision; the loss on a refund after the payout is borne by the platform
- **What the AI clarified:** I mixed two scenarios in C1.3 — through a request, a refund after the payout is already
  impossible (the loss is only the fee); after the payout only the Dashboard/a failure, and then the loss is the
  instructor's share + the fee, not just the fee. From C1.2 follows a new requirement: the payout checks for
  an active request
- **How I verified:** needs no code — this is a PO decision. The AI mentor checked my answer to C1.3 against Q9, Q25 and C1.2 and showed that I had mixed two scenarios.
- **Verdict:** `modified` — C1.1 and C1.2 are mine unchanged; C1.3 corrected per the AI
- **Why:** *(worded by AI, to confirm in my own words)* I answered "the loss is borne by the platform (the fee)". The AI showed that under my own rule C1.2 a refund through a request after the payout is impossible, so the loss there is only the fee. A full loss (the instructor's share plus the fee) is possible only through the Dashboard after the window

### 2026-11-08 — Contradiction C2 (bug Q8): protection in two places and the atomic transition were proposed by the AI
- **Stage:** analysis (part 2)
- **Context the AI had:** the whole repository, `discovery.md` (Q5, Q8, Q18), `analysis.md`
- **AI proposed:** the chain of bug Q8 through the code and the conclusion that the hold (Q18) makes Q8 the main
  scenario. At my request "what do you recommend" — protection both on refund and on payout (option c),
  a check of the charge state in Stripe before the payout, and a requirement for an atomic transition of the transfer state
- **My decision:** cancel the transfer on refund + the payout checks the status + sync with
  Stripe (my idea) → accepted the AI's clarification: "sync" = a charge check before the payout; added C2.4
- **What the AI clarified:** "return the money to the student" does not need a reversal — the held share is still on the
  platform's balance; a check in Stripe does not replace the S7 reconciliation; two checks without atomicity do not save you from
  a race
- **How I verified:** the re-check at my request was done by the AI mentor (2026-11-08): reversal only for `transferred` (`payment.service.ts:192`); the sweep takes all `pending` without checking `payment.status` (`connect.service.ts:168-170`); `TransferStatus` has no "cancelled" state (`prisma/schema/payments.prisma`). *Not verified by me.*
- **Verdict:** `accepted` — option (c) and the atomicity requirement accepted; my idea "sync with Stripe" clarified as a charge check before the payout
- **Why:** *(worded by AI, to confirm in my own words)* I came up with the hold on the money (Q18) to close Q8. The AI showed that without code changes it makes Q8 the main scenario: every sale becomes `pending`. Protection is needed both on refund and on payout, and two checks without an atomic transition do not save you from a race

### 2026-11-08 — Contradiction C3: an exception to Q12 only through the admin panel with a reason
- **Stage:** analysis (part 2)
- **Context the AI had:** `analysis.md` (A5, E1, E2), `discovery.md` (Q12, Q24)
- **AI proposed:** formulated the contradiction (Q12 is mandatory for the student, not for the admin),
  the fact "the webhook carries no refund reason", examples of legitimate exceptions, and three questions. Proposed no decisions
- **My decisions:** the admin can break Q12 only through the admin panel with a mandatory reason (audit);
  a refund through the Dashboard → E2 consequences + a notification and a "needs review" record
- **What the AI added:** open questions — which exact action in the admin panel (approve the request or refund without
  a request); whether the exception counts toward D3 if the platform is at fault; in a pet project "review" = audit
- **How I verified:** needs no code — this is a PO decision. The fact "the webhook carries no refund reason" the AI mentor took from `route.ts:55-64` (the handler reads only `payment_intent`).
- **Verdict:** `accepted` — the AI proposed no decisions; its open questions accepted for Specification
- **Why:** *(worded by AI, to confirm in my own words)* An exception to rule Q12 is needed (technical errors, legal requirements). But an exception without a reason is a hole, while an exception with a recorded reason is a controlled decision. So I allow the exception only through the admin panel, and I flag a Dashboard refund for review

### 2026-11-08 — Contradiction C4: at most 2 requests, only inside the window
- **Stage:** analysis (part 2)
- **Context the AI had:** `analysis.md` (D3, S3, C1)
- **AI proposed:** the contradiction D3 ↔ S3 (a limit on refunds, but not on requests) and the consequence —
  each request delays the instructor's money (C1.2). Three questions, no decisions
- **My decisions:** at most 2 requests (the first — you may make a mistake, the second — final; the minimum so that people don't
  abuse it or drag it out); only inside the window; the admin sees the history; we do not check the novelty of the evidence
  — the form is: reason + file + note
- **What the AI added:** C4.2 together with C1.1 means that a late request (day 29, rejection on day 32)
  takes away the second attempt — left Open
- **How I verified:** needs no code — this is a PO decision.
- **Verdict:** `accepted` — the AI proposed no decisions; the consequence of C4.2 + C1.1 accepted as Open
- **Why:** *see C4.1 in `analysis.md`*

### 2026-11-08 — Contradiction C5: Q12 is a filter, evidence is the admin's decision
- **Stage:** analysis (part 2)
- **Context the AI had:** `analysis.md` (Q12, S3, C3, C4, A9)
- **AI proposed:** three models of how Q12 and evidence relate, with the consequences of each; a question about
  a mandatory rejection reason in connection with the second attempt (C4)
- **My decisions:** model (b); the admin must write a clear rejection reason with arguments and may
  attach files
- **What the AI added:** an auto-rejection is better done by disabling the button, so as not to "eat" an attempt; files from
  the admin are a second upload surface for the security-auditor
- **How I verified:** needs no code — this is a PO decision.
- **Verdict:** `accepted` — I chose model (b) out of the three the AI formulated; the proposal to disable the button instead of an auto-rejection accepted as Open
- **Why:** *see C5.1–C5.2 in `analysis.md`*

### 2026-11-08 — Part 4: the AI without code found logic holes we did not see; with code — the opposite
- **Stage:** analysis (part 4)
- **Context the AI had:** a separate agent — only Problem + Q1–Q25 + A1–A8 in their pre-Analysis state,
  the SDD guide's prompt. No code, repo, web, or `analysis.md`. Answer: [`ai-raw/analysis-review.md`](ai-raw/analysis-review.md).
  The comparison was done for me by the AI mentor (with the code and all the context)
- **AI proposed:** 51 findings; 24 matches with our analysis, 14 partial, 11 new, 2 errors
  ([`analysis.md` §Part 4](analysis.md))
- **Most valuable new ones:** N4 — in a short course the first lesson = 33%, so a percentage threshold blocks exactly
  the "empty course" (hits my decision A2); S2 — the transition period: old purchases are already
  `transferred`, Q18 does not protect them; E8 — dispute + refund = double refund
- **Where the AI was wrong:** E5 — without code it decided that `completedAt` stays on a repeat purchase;
  in reality it is cleared (`enrollment.service.ts:73-78`), and the problem is the opposite (A4 R1–R2)
- **How I verified:** the "real / weak" ratings were given by the AI mentor. E5 verified with code: on a repeat purchase `completedAt` is cleared (`enrollment.service.ts:73-78`). V9 verified: there are no coupons, `lib/course/discount.ts` only shows the old price. *Not verified by me.*
- **Verdict:** `modified` — N4, S2, E8 `accepted` (new real requirements); E5 `rejected` (a false conclusion without code); E2 judged weak
- **Why:** *(worded by AI, to confirm in my own words)* The document shows holes in the logic, the code — holes in reality. The agent without code found what we walked past because we were looking at the code: short courses (N4) and the transition period for old purchases (S2). But where code was needed, it was wrong (E5)

### 2026-11-15 — A1: platform research changed the model from "the admin reviews everything" to M3b
- **Stage:** alternatives (A1)
- **Context the AI had:** the whole repository, web search. I asked it to think about the models that are
  possible with the current codebase, and how platforms do it, **without taking my analysis and decisions into account**
- **AI proposed:** a platform table (Udemy, Coursera, Teachable, Domestika, EU Art. 16(m)), five
  models M1–M5 and which of them can be built on our code
  ([`decisions.md` §A1](decisions.md))
- **What changed:** before the research I held to a hybrid (auto-rejection by Q12 + the admin reviews everything that
  passed the filter). After — I chose M3b: automation + account-level limits + tracking of opened
  lessons, the admin only for appeals. The idea of tracking opened lessons is mine
- **How I verified:** opened the official Udemy and Teachable pages (2026-11-15): Udemy refuses
  if a significant part of the course has been consumed. Coursera and Domestika confirmed only by third-party sites —
  did not verify
- **Verdict:** `changed-after-research`
- **Why:** I was choosing between "the admin reviews everything" and automation without knowing how others do it.
  The platforms showed that nobody measures whether the student actually learned: they protect themselves with account-level
  limits, and a human is needed only for appeals. Hence my idea of tracking opened lessons as a signal
  that the content was consumed

### 2026-11-15 — A1: the AI filled in the matrix, I corrected a score and made K4 a veto
- **Stage:** alternatives (A1)
- **Context the AI had:** my criteria and weights, options M2 / M3a / M3b, a table of facts for
  each criterion
- **AI proposed:** scores for all cells and the totals; showed that by total M2 wins (10), even though it has −−
  on the critical K4; a sensitivity check (the decision is fragile); the idea of treating a critical criterion as a
  veto rather than a weight
- **My decisions:** K4 — a veto (M2 drops out); changed M3b's score on K4 from + to ++. Result: M3b 9
  versus M3a 2, robust for any weight of K5
- **How I verified:** checked the scores against the fact table. Disagreed with "+" for M3b on K4: we catch the student from
  F4, and the signal's limits are immaterial for abuse, hence "++". Needs no code — this is a score
- **Verdict:** `modified`
- **Why:** the matrix showed that without a veto the winner is an option that lets abuse through
  automatically. A critical criterion cannot be compensated by other advantages, so I made K4 a veto

### 2026-11-15 — Q13: changed the threshold after the data, rejected a percentage "out of thin air"
- **Stage:** alternatives (Q13)
- **Context the AI had:** the whole repository, the dev DB, my proposal N = 2 + 20%
- **AI proposed:** (1) dev DB data: in all 7 courses the first two lessons are an intro and setup;
  there are no free preview lessons, only a trailer (`Course.previewVideoUrl`); (2) formulas A
  `min(3, L − 1)` and B `min(3, ⌊L/2⌋)` for short courses, advice — B; (3) for revisit condition A1 —
  an appeal share X = 20% or 30%
- **My decisions:** changed N from 2 to 3 and removed the percentage; chose formula B; **rejected X = 20/30%:
  a percentage must be measured, not taken out of thin air** → the AI proposed a baseline over the first 4
  weeks, I accepted
- **How I verified:** the dev DB query was run by the AI; I did not open the course in the app myself.
  *Not verified by me*
- **Verdict:** `changed-after-research` (N = 2 → 3) · `accepted` (formula B) · `rejected`
  (X = 20/30%)
- **Why:** I took the number 2 intuitively. The data showed that the first two lessons are an intro, so the student
  would exhaust the limit without seeing any content. I did not accept a percentage for the revisit condition, because nothing
  justifies it. Without data it is better not to set a number, but to write down how to measure it

### 2026-11-15 — A3: window length — the breakdown and the matrix were done by the AI, I accepted as is
- **Stage:** alternatives (A3)
- **Context the AI had:** `decisions.md` (A1, Q13), `discovery.md`
  (Q14, Q15, Q18), web search; my hypothesis "14 days instead of 30"
- **AI proposed:** a search for a Stripe limit on refunding an old payment (found no official one) and
  the chargeback deadline (120 days); a breakdown of six candidate criteria — strike three (the promise →
  a transition question, abuse — solved by the M3b threshold, complexity — does not discriminate); option V4
  ("14 days from the first opened lesson"); a filled-in matrix and a sensitivity check; drafts of "what
  I lose" and the revisit conditions
- **My decisions:** weights K1 = 2, K2 = 2, K3 = 1; V2 — 14 days from payment; confirmed Q15 (the new rules
  also for old purchases)
- **How I verified:** accepted the matrix and the drafts as is, did not change cells. *Not verified
  by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why 14 days and not 30*

### 2026-11-15 — A8: the Stripe fee — a deliberate "change nothing"
- **Stage:** alternatives (A8 / Q17)
- **Context the AI had:** the whole repository (`lib/platformFee.ts`, `payment.service.ts`),
  `discovery.md` (Q16, Q17), `decisions.md` (A1, A3)
- **AI proposed:** facts from the code (the split is from the full price, the platform bears the fee); that Q18
  changed the economics of a refund (the instructor's share is cancelled, not clawed back); four options;
  "scope" as a possible veto; a matrix; that for V2 the exact fee is known only from Stripe; a formula for the
  revisit condition and replacing the "refund share" with the direct loss, because the threshold depends on the course price
- **My decisions:** scope is **not** a veto — changing the split is within the feature; K3 (full refund) — a veto,
  V4 drops out; V2 on K2 — "−" (rejected the alternative reading "a proportional split is fair");
  decision V1; acceptable loss — 5% of platform revenue
- **How I verified:** did not open the code; the example numbers ($50, ~$1.75) come from Q17. *Not verified
  by me*
- **Verdict:** `modified` — rejected the AI's proposal to make scope a veto, accepted the rest
- **Why:** *TODO (me): in my own words — why the platform bears the fee, not the instructor*

### 2026-11-15 — S2: the staged launch was proposed by the AI, I accepted
- **Stage:** alternatives (S2)
- **Context the AI had:** the whole repository, `decisions.md` (A1, A3, Q15),
  `analysis.md` (C2, the agent's finding S2)
- **AI proposed:** narrowed S2 to purchases in the `transferred` state (`pending` already closes C2);
  four options, including V3 — a staged launch (the hold 14 days before the button), which removes the
  transition period entirely; a V1 / V3 comparison without a full matrix
- **My decisions:** rejected V2 and V4 with reasons; chose V3; agreed that a full matrix is unnecessary
- **How I verified:** needs no code — a decision about release order. The fact about the reversal for
  `transferred` (`payment.service.ts:193`) is from the code, verified by the AI. *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why a staged launch and not accept the risk*

### 2026-11-15 — D2: from zero, like Udemy; what to delete I decided, the conflicts the AI found
- **Stage:** alternatives (D2)
- **Context the AI had:** the whole repository, web search, `analysis.md` (A4, D1–D4),
  `decisions.md`
- **AI proposed:** facts from the code (`LessonProgress` is tied to the student, not to the purchase;
  total learning time is computed live from `LessonProgress`); platform research (Udemy — from
  zero, Teachable — continues); four options. Found three conflicts in my answer:
  "delete progress" breaks "keep total time"; "after the appeal window" — there is no such window
  after a refund; keeping ConceptMastery because of recommendations contradicts D4
- **My decisions:** from zero — because content and quizzes may have changed (my argument); delete progress,
  quizzes, tutor conversations, keep ConceptMastery; keep the purchase trace; learning time — via
  a cumulative counter (option a); trigger — a confirmed refund; D4 and ConceptMastery
  reconciled as "interest" versus "knowledge"
- **How I verified:** Udemy — official help (I had opened the links earlier for A1, this page — no).
  Did not open the code. *Not verified by me*
- **Verdict:** `modified` — my decision refined by three conflicts found by the AI
- **Why:** *TODO (me): in my own words — why from zero and why we keep knowledge*

### 2026-11-15 — C2.4: the atomicity mechanism was proposed by the AI; a latent double-transfer bug was found
- **Stage:** alternatives (C2.4)
- **Context the AI had:** the whole repository (`connect.service.ts`, `payment.service.ts`,
  `prisma/schema/payments.prisma`, `package.json`), `analysis.md` (C2)
- **AI proposed:** facts T1–T4 — in particular, that there is no idempotency key anywhere and two parallel
  sweeps can already today transfer to the instructor twice (a latent bug unrelated to Refund),
  and that there is no scheduler for the payout after the window (**an AI error, corrected by it the same day:** the app has no scheduler, but there is n8n with a daily cron, ADR-014); five mechanisms; a recommendation of V1 + an idempotency
  key; the scenario "refund during `transferring`"
- **My decisions:** V1 + the key; fix the latent bug within the feature
- **How I verified:** did not open the code. *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why a conditional update and not locking*

### 2026-11-15 — T4: checked the hold via Stripe in the documentation; the AI found gaps in its own design
- **Stage:** alternatives (T4)
- **Context the AI had:** the whole repository, `stripe docs` (CLI), the Vercel and Stripe documentation
- **AI proposed:** first an n8n cron (based on ADR-014) — **wrong: n8n is turned off**, the ADR is outdated;
  option V5 — delaying payouts in Stripe (`delay_days`), which would remove the scheduler; then a design
  on Vercel Cron with a Redis heartbeat
- **What happened next:**
  1. I first rejected V5 with a wrong reason ("the instructor won't limit themselves"; in reality
     the platform sets it), then asked to check the documentation. `stripe docs` showed that
     `delay_days` applies only to `on_behalf_of` and direct charges, and we have separate charges and
     transfers. The rejection confirmed with the right reason
  2. At my request to re-analyze Vercel Cron, the AI found two gaps in **its own**
     design: logs on Hobby live for 1 hour; a heartbeat in Redis without a notification will be seen by nobody
  3. The AI found that the existing Sweep button in the admin panel would, after Q18, pay out the held money — a second path
     to bug Q8
- **My decisions:** not n8n (turned off, so as not to pay for a server); Vercel Cron + Redis for locking;
  an admin panel with four blocks; Sweep → "Run job now"; email to the admin; ADR-014 — later
- **How I verified:** the Stripe and Vercel documentation was read by the AI (`stripe docs`, a web request).
  *Not verified by me*
- **Verdict:** `changed-after-research` (V5 rejected with the right reason after the documentation) ·
  `modified` (the Vercel Cron design extended after the re-analysis)
- **Why:** *TODO (me): in my own words — why not Stripe and why the re-analysis changed the design*

### 2026-11-15 — S7: synchronous application + event replay in the same cron
- **Stage:** alternatives (S7)
- **Context the AI had:** the whole repository (`app/api/stripe/webhook/route.ts`), `stripe docs`,
  `decisions.md` (A1, C2.4, D2, T4)
- **AI proposed:** facts W1–W5 (in particular 30 days of event retention, 3 days of retries in live and only
  a few hours in sandbox); that after M3b S7 narrows to Dashboard refunds and failed refunds,
  because the `refunds.create` response is synchronous; four options; a recommendation of V1 + synchronous application
- **My decisions:** agreed with the breakdown, chose V1 and synchronous application
- **How I verified:** the documentation was read by the AI via `stripe docs`. *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why event replay and not a list of refunds*

### 2026-11-15 — E2: an explicit revocation field; the verification page moved to a separate feature
- **Stage:** alternatives (E2)
- **Context the AI had:** the whole repository (certificates, enrollment, checkout),
  `decisions.md`
- **AI proposed:** facts K1–K5 (the list and the PDF do not check status; there is no public verification page,
  so a downloaded PDF cannot be revoked); three options; a recommendation of V2 (filter by status)
- **My decisions:** V3 instead of the recommended V2 — because I want to add a certificate view and verification
  page; agreed to move it into a separate feature; a closed list of two reasons. To the question about
  a repeat purchase I answered "an unrealistic case" — the AI showed from the code that it is allowed (K4), and
  gave an example (an admin exception because of a wrong price); I chose "b" — allow it, the revocation is
  cleared
- **How I verified:** did not open the code. *Not verified by me*
- **Verdict:** `rejected` (rejected the V2 recommendation in favour of V3) · `modified` (my "unrealistic
  case" corrected by a fact from the code)
- **Why:** *TODO (me): in my own words — why V3 and why the verification page separately*

### 2026-11-16 — ADR-037: the "ADR or spec" split and the draft were produced by the AI
- **Stage:** decision (ADR)
- **Context the AI had:** `decisions.md`, `analysis.md` (C2), ADR-019,
  ADR-014, `documentation-process.md` §5, the payout code
- **AI proposed:** ran 10 decisions through the "three-month test": into the ADR — Q18, T4, C2.4, S7, A1
  briefly; into the spec — Q13, A3, A8, S2, D2, E2. One ADR instead of four, because the decisions hold on to one
  another. Wrote the draft `docs/adr/037-refund-payout-hold-and-money-consistency.md` (in English, like
  the rest of the ADRs). **Added on its own:** a single "can be paid out" predicate for all payout paths,
  including the `account.updated` sweep (`app/api/stripe/webhook/route.ts:74`) and the immediate transfer in
  `finalizeCheckout` (`payment.service.ts:124,162`). In `decisions.md` these two paths are not named explicitly, there is only
  the Sweep button
- **My decisions:** agreed with the split and with one ADR; agreed that **all payout paths** (cron,
  "Run now", the `account.updated` sweep, `finalizeCheckout`) go through one condition. The draft — *under
  review*
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted` (the split) · the draft — TODO
- **Why:** *TODO (me): in my own words — why these four decisions go in the ADR, and the thresholds and the window — in the spec*
