# AI decision log

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

### 2026-11-16 — A6: how the instructor sees held money
- **Stage:** specification (open question A6)
- **Context the AI had:** the whole repository (payment repository, instructor Revenue and payout
  settings UI), ADR-037, `decisions.md`
- **AI proposed:** facts F1–F4, including that `getOwedBalance` shows a refunded `pending` sale as
  owed (F3); three options; a recommendation of V2. Flagged as unchecked: whether
  `getRecentTransactions` already shows the transfer status
- **My decisions:** V2; the instructor does not see refund requests at all
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted` (V2) · own addition (requests hidden from the instructor)
- **Why:** *TODO (me): in my own words — why two amounts and why the instructor must not see requests*

### 2026-11-16 — DC: double charge for the same course
- **Stage:** specification (open question from E2)
- **Context the AI had:** the whole repository (checkout, `finalizeCheckout`, `handleRefund`, Prisma
  schema), `decisions.md`
- **AI proposed:** showed that a double charge is reachable (two tabs, no unique constraint on
  `Payment`) and that `handleRefund` then removes paid access; three options; a recommendation of
  V3 + V2, V1 as optional
- **My decisions:** V3 + V2
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why auto-refund the duplicate instead of only guarding access*

### 2026-11-16 — User flow: the draft of all three flows was written by the AI
- **Stage:** specification (User flow)
- **Context the AI had:** `decisions.md`, `analysis.md`, `discovery.md`, ADR-037, the spec so far
- **AI proposed:** student, admin and instructor flows assembled from the recorded decisions; seven
  open questions OQ-1–OQ-7 where the decisions are silent or conflict (notably OQ-1: C5.3 "disable
  the button" vs C4 "auto-denial → appeal"; OQ-2: the M3b account-level limit has no number)
- **My decisions:** *TODO (me): under review*
- **How I verified:** *Not verified by me*
- **Verdict:** TODO
- **Why:** *TODO (me)*

### 2026-11-16 — OQ-1: a direct appeal when the threshold is exceeded
- **Stage:** specification (User flow, OQ-1)
- **Context the AI had:** `analysis.md` (C4, C5.3), `decisions.md` (A1, Q13), the User flow draft
- **AI proposed:** found the conflict between C5.3 (disable the button) and C4 (denial → appeal);
  three options; a recommendation of V3 (a direct appeal instead of the button)
- **My decisions:** V3
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why a direct appeal and not "no button" for the threshold*

### 2026-11-16 — OQ-2: account-level refund limit
- **Stage:** specification (User flow, OQ-2)
- **Context the AI had:** `decisions.md` (A1, Q13, platform research), `analysis.md` (R3, D3)
- **AI proposed:** noticed that M3b names "account-level limits" with no number; the "sampler"
  scenario; three options; a recommendation of V2 with N = 3 and counting only the student's
  automatic refunds (left appeal-approved refunds to me)
- **My decisions:** V2, N = 3, only automatic refunds count
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why a count per 12 months and why 3*

### 2026-11-16 — OQ-3: platform-initiated refunds do not use up the student's one refund; E2 revised
- **Stage:** specification (User flow, OQ-3)
- **Context the AI had:** `analysis.md` (C3.1, D3, E2), `decisions.md` (OQ-2)
- **AI proposed:** the wrong-price scenario; three options; a recommendation of V1; pointed out that
  V1 conflicts with Analysis E2 (Dashboard refund counts) and offered to revise it
- **My decisions:** V1; revise E2 so that a Dashboard refund does not count either
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted` · `modified` (E2, my earlier decision, revised)
- **Why:** *TODO (me): in my own words — why platform actions do not use up the student's right*

### 2026-11-16 — OQ-4: no refund notification to the instructor
- **Stage:** specification (User flow, OQ-4)
- **Context the AI had:** `notification.service.ts`, Revenue UI, ADR-037, A6
- **AI proposed:** facts F1–F3; three options; a recommendation of V1 and the idea of aggregated
  reasons as a separate feature
- **My decisions:** V1; aggregated reasons recorded as out of scope
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why the instructor is not told about a refund*

### 2026-11-16 — OQ-5: automatic approval of an overdue appeal; Stripe refund age checked
- **Stage:** specification (User flow, OQ-5)
- **Context the AI had:** spec (Business value), `analysis.md` (F6, E10), T4; Stripe docs via
  `stripe docs /refunds` and `/error-codes`
- **AI proposed:** pointed out that "reminders only" breaks the 31-day worst case in the spec; three
  options; a recommendation of V2. Claimed from memory that Stripe allows refunds well beyond 31 days;
  on my request checked the docs: **no age limit is documented** (claim not confirmed), plus the
  45-day insufficient-balance failure, disputed-charge refusal and 5–10 business days to the card
- **My decisions:** V2; asked for the Stripe check before recording
- **How I verified:** asked for the check; the docs were read by the AI. *Not verified by me*
- **Verdict:** `accepted` · AI memory claim `unconfirmed`
- **Why:** *TODO (me): in my own words — why the platform, not the student, pays for a late review*

### 2026-11-16 — OQ-6: warning on repurchase
- **Stage:** specification (User flow, OQ-6)
- **Context the AI had:** `analysis.md` (D3), OQ-3, OQ-5
- **AI proposed:** two options; a recommendation of V1, shown only when the earlier refund counts
  under D3
- **My decisions:** V1
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — OQ-7a: partial Dashboard refund kept as a goodwill compensation
- **Stage:** specification (User flow, OQ-7a / Analysis E3)
- **Context the AI had:** `analysis.md` (E3), `handleRefund`, OQ-3
- **AI proposed:** facts F1–F3; the three options from E3; a recommendation of (c); asked who bears
  the compensation and used "a wrong price by the instructor" as a case for reducing the instructor's share
- **My decisions:** (c); the platform bears it. **Overruled the AI's example:** the student sees the
  price before buying, so a $200-instead-of-$20 price is the instructor's and the student's decision,
  not a platform error. The same example was used by the AI in OQ-3 and E2
- **How I verified:** reasoning, not code. *Not verified by me*
- **Verdict:** `accepted` (c) · `rejected` (the AI's wrong-price example)
- **Why:** *TODO (me)*

### 2026-11-16 — OQ-7b: dispute check before refund; Stripe dispute rules checked
- **Stage:** specification (User flow, OQ-7b / Analysis E8)
- **Context the AI had:** `analysis.md` (E4, E8), ADR-037; Stripe docs via `stripe docs /disputes/*`
- **AI proposed:** split E8 into two orders of events; two options; a recommendation of V1. Said order
  2 (refund, then dispute) was unverified; on my request read the docs and found that a fully
  refunded payment cannot be disputed, while a partially refunded one can — which moves the residual
  risk onto OQ-7a
- **My decisions:** V1; asked for the order-2 check before recording
- **How I verified:** asked for the check; the docs were read by the AI. *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — Functional requirements: the whole draft was written by the AI
- **Stage:** specification (Functional requirements)
- **Context the AI had:** the spec's User flow, `decisions.md`, `analysis.md` (D1–D4, E2, V7), ADR-037
- **AI proposed:** 57 requirements in four groups (FR-S student, FR-A admin, FR-I instructor, FR-P
  money and effects), each traced to a decision; marked **[open]** where no decision exists (appeal
  file limits, notification matrix V7, batch size, messaging direction D1, the review after a refund,
  the `/contact` link) and **[AI]** where it added a detail (appeal queue order)
- **My decisions:** *TODO (me): under review.* I chose a full AI draft over writing the student
  group myself
- **How I verified:** *Not verified by me*
- **Verdict:** TODO
- **Why:** *TODO (me)*

### 2026-11-16 — D1: messaging closed both ways, history read-only
- **Stage:** specification (Functional requirements, FR-P11)
- **Context the AI had:** `analysis.md` (D1, I6), `messaging.service.ts`, A6, OQ-4
- **AI proposed:** two sub-questions (direction, history), options, a recommendation of V2 + (a), and
  named the trade-off with A6 (the instructor can infer a refund from the closed conversation)
- **My decisions:** V2 + (a)
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — E2-R: the review after a refund
- **Stage:** specification (Functional requirements, FR-P13)
- **Context the AI had:** `review.service.ts`, `courseReview.repository.ts`, `review.prisma`, Analysis E2
- **AI proposed:** F1 (a self-refunded student never has a review, which narrows the question to the
  Dashboard and exception paths); F3 (the unique key blocks a new review after a soft delete, inferred
  from the schema, not exercised); three options; a recommendation of V3
- **My decisions:** V3
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — D-2: `/contact` out of scope
- **Stage:** specification (Functional requirements, FR-P21)
- **Context the AI had:** `grep "/contact" app/`, Q21, FR-P21
- **AI proposed:** found three dead links (not only the footer), so `/contact` is a sales page, not
  a refund channel; a recommendation of V1
- **My decisions:** V1
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — Security design pass; T11 and three fixes
- **Stage:** specification (security, §3d)
- **Context the AI had:** the `security-auditor` agent read the spec, ADR-037, ADR-019, ADR-017 and the
  payment, webhook, messaging, review, certificate and upload code. Raw output:
  [`ai-raw/security-design-pass.md`](ai-raw/security-design-pass.md)
- **AI proposed:** 29 threats with controls and acceptance-criterion lines; five decisions; ten
  spec/ADR defects. Among them, errors in earlier AI work: T6 (the ADR-037 predicate, drafted by the
  AI, releases during the appeal grace), T11 (the AI's OQ-5 recommendation lets direct appeals bypass
  the rules), `paidAt` (used by the AI in the FR terms; the column does not exist), ADR-017 Rule 4
  conflict. The main session spot-checked `paidAt` and the webhook dedup in code
- **My decisions:** T11 → V2; fix T6, `paidAt` and ADR-017 without a separate discussion
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted` · the AI's earlier OQ-5 recommendation and ADR-037 draft `corrected` by a
  second AI pass
- **Why:** *TODO (me)*

### 2026-11-16 — T10: several accounts accepted as a risk
- **Stage:** specification (security, T10)
- **Context the AI had:** the security pass, OQ-2, T11, D-7
- **AI proposed:** two options; a recommendation of V1 as an accepted risk; noted that without a
  fingerprint the abuse is not observable, so the revisit trigger is a proxy metric
- **My decisions:** V1
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — T27: course deletion moved to a separate feature
- **Stage:** specification (security, T27)
- **Context the AI had:** the security pass, the course router and repository
- **AI proposed:** widened the threat from the code (deleting a course hides lessons from every buyer,
  not only those inside the window); three options; a recommendation of V1 (auto-refund) in Refund +
  V3 separately; suggested "course deleted after purchase" as the better admin-exception example
- **My decisions:** **V3 only**, as a separate feature, with my rules: no full deletion of a course
  with purchases; unpublish only; buyers keep access permanently; no new purchases. Rejected V1
- **How I verified:** *Not verified by me*
- **Verdict:** `rejected` (V1 + V3 recommendation) · `modified` (V3 with my rules)
- **Why:** *TODO (me)*

### 2026-11-16 — FR-S15: appeal files, private store, 30-day retention
- **Stage:** specification (security, FR-S15)
- **Context the AI had:** the security pass §3, `vercel.service.ts`, Vercel docs via context7
- **AI proposed:** the security agent's limits; checked in the Vercel docs that store access is fixed
  at creation, the 4.5 MB body limit, private storage on Hobby and the Hobby limits; recommended
  Postgres `bytea`, then a private store; proposed 90 days, then 150 days from payment
- **My decisions:** a private Blob store (I first asked whether the public one is enough for a pet
  project, then asked the AI to check the plan); **30 days** after the final decision. I asked
  whether 90 days is common practice: the AI admitted there is no such standard. When I proposed 30
  days, the AI checked it against the purpose and found its own 90/150-day reasoning used the wrong
  purpose (the student's files are not the platform's dispute evidence)
- **How I verified:** asked for the plan check; the docs were read by the AI. *Not verified by me*
- **Verdict:** `rejected` (the AI's `bytea`, 90-day and 150-day proposals) · `accepted` (limits,
  private store)
- **Why:** *TODO (me)*

### 2026-11-16 — Security controls moved into the spec; ADR-037 §2 and §4 amended
- **Stage:** specification (security, §3d)
- **Context the AI had:** the security pass, `stripe docs /api/idempotent_requests`, the webhook route
- **AI proposed:** verified T7 in the Stripe docs (keys pruned once ≥ 24 h old; a reused key is then a
  new request), so ADR-037 §2 "retry with the same key is safe" was wrong (an AI-drafted claim);
  amended §2 (list before retry) and §4 (the payment-status CAS is the gate, dedup is not);
  `security.md` with 27 controls and accepted risks; AC-C1…C29 in the spec; new FR-P18a, P23–P26;
  extended FR-A3, P4, P14, P19, P20; marked D2 superseded by FR-P14
- **My decisions:** asked to commit first, then fix T7 and move the controls in one batch
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted` · the AI's ADR-037 §2 claim `corrected`
- **Why:** *TODO (me)*

### 2026-11-16 — Edge cases and Failure scenarios drafted by the AI
- **Stage:** specification (Edge cases, Failure scenarios)
- **Context the AI had:** `analysis.md` (S4–S7, F1–F8, R4), `decisions.md`, ADR-037, `security.md`
- **AI proposed:** 17 edge cases and 13 failure scenarios, each traced to a decision; four **[open]**
  items with AI suggestions: EC-3 (a deleted opened lesson), EC-12 (account deletion with an open
  request), FS-3 (a refund that fails at the bank after the effects were applied, which D2 cannot
  undo), FS-8 (Redis down); four **[AI]** derived rules (EC-4, EC-11, EC-16, EC-17)
- **My decisions:** *TODO (me): under review*
- **How I verified:** *Not verified by me*
- **Verdict:** TODO
- **Why:** *TODO (me)*

### 2026-11-16 — FS-3: failed refund after the effects were applied
- **Stage:** specification (Failure scenarios, FS-3)
- **Context the AI had:** FR-P14, D2, Stripe refund docs (failed refunds)
- **AI proposed:** found that synchronous effects (FR-P14) plus irreversible cleanup (D2) leave the
  student with neither money nor course if the bank rejects the refund later; three options; a
  recommendation of V1 + V2
- **My decisions:** V1 + V2
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — LLM security pass; AI-C6 accepted as a risk
- **Stage:** specification (security, LLM, §3d)
- **Context the AI had:** the `llm-security-auditor` read the tutor route and tools, the embedding
  repository, study-guide, quiz, learning-path and lesson-assistant code, and
  `ai-tutor-guardrails/security.md`. Raw output: [`ai-raw/llm-security-design-pass.md`](ai-raw/llm-security-design-pass.md).
  The main session spot-checked `searchCourseChunks` (course-wide, `embedding.repository.ts:149-163`)
- **AI proposed:** the tutor's `search_across_course` reads the whole course from one opened lesson,
  so the threshold can be bypassed without any injection; restrict the tutor, study guide and
  quizzes to opened lessons (AI-C1…C4); FR-P9 misses `ConceptCheck` and `LearningPathCache`; a
  refunded course can be recommended back; tracing unverified; ship the gates with the hold. For
  AI-C6 the main session recommended V1
- **My decisions:** AI-C6 → V2 (accept the bounded risk), overruling the recommendation
- **How I verified:** *Not verified by me*
- **Verdict:** `rejected` (V1 recommendation for AI-C6)
- **Why:** *TODO (me)*

### 2026-11-16 — REC: refunded courses are not recommended back
- **Stage:** specification (security, LLM, Q3.4)
- **Context the AI had:** `enrollment.repository.ts`, FR-P12, D3, OQ-3, OQ-6
- **AI proposed:** three options; a recommendation of V3
- **My decisions:** V3
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — LLM controls moved into the spec
- **Stage:** specification (security, LLM)
- **Context the AI had:** the LLM pass, `ai-tutor-guardrails/security.md` (S13 §25, the tracing
  requirement), `lib/env.js`, `.env.example`
- **AI proposed:** FR-P19a (content only from opened lessons), extended FR-P9 (concept checks, cached
  learning path), FR-P12 (recompute on all five paths), FR-P20 (gates ship with the hold); the AI
  controls table in `security.md`; AC-L1…L14; marked S13 §25 reopened in `ai-tutor-guardrails`;
  tracing inherited from the existing requirement instead of a new control (local `.env.local` has
  tracing on for development; production not checkable from here)
- **My decisions:** move as a batch and commit
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — EC-3: deleted lessons do not count as opened
- **Stage:** specification (Edge cases, EC-3)
- **Context the AI had:** Q13, the Edge cases draft
- **AI proposed:** in the draft, V1 (count deleted lessons); when asked to decide, worked through a
  scenario and **changed its own recommendation** to V2
- **My decisions:** V2
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted` · the AI's draft suggestion `corrected` by the AI itself
- **Why:** *TODO (me)*

### 2026-11-16 — EC-12: account deletion closes an open appeal, with a warning
- **Stage:** specification (Edge cases, EC-12)
- **Context the AI had:** ADR-025, FR-P23, the Edge cases draft
- **AI proposed:** the conflict between keeping the appeal and erasing its texts (FR-P23); two
  options; a recommendation of V1 + a warning on the account-deletion page
- **My decisions:** V1 + the warning
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — FS-8: skip the job run when Redis is down
- **Stage:** specification (Failure scenarios, FS-8)
- **Context the AI had:** ADR-037 §3, `security.md` (C5, C7, C8, C16), `upstash.store.ts`
- **AI proposed:** that the lock is availability only; the fail-closed precedent; two options; a
  recommendation of V1
- **My decisions:** V1
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — FS-3 follow-up: the instructor's share returns to held
- **Stage:** specification (Failure scenarios, FS-3)
- **Context the AI had:** FS-3, FR-P2a, FR-P24, C18
- **AI proposed:** the two outcomes; two options; a recommendation of V2, built on FR-P2a
- **My decisions:** V2
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-16 — Alternatives, Trade-offs, Decision, functional AC, tests, Source of truth, Agent notes drafted by the AI
- **Stage:** specification (closing sections)
- **Context the AI had:** `decisions.md`, ADR-037, `security.md`, the spec so far
- **AI proposed:** summary tables of the main decisions and their matrices (copied from
  `decisions.md`, not re-scored); a "why in this context" list; AC-F1…F21 traced to FRs; a
  notification matrix closing FR-S21 with one **[AI]** cell (an admin email when an appeal is filed);
  test levels; source of truth; agent notes with the invariants a change could break
- **My decisions:** *TODO (me): under review*
- **How I verified:** *Not verified by me*
- **Verdict:** TODO
- **Why:** *TODO (me)*

### 2026-11-21 — OQ-1 reconsidered and kept; T11 amended for the tab race
- **Stage:** specification (User flow A1, T11)
- **Context the AI had:** OQ-1, OQ-5, T11, FR-S13/S14/S16, FR-A5, FR-P2a, AC-F3, EC-3
- **AI proposed:** a side-by-side of V3 (direct appeal) and V1 (appeal only after a denial) on five
  scenarios, recommending V1 with T11 keyed on the failed condition; found the tab race in the
  current V3 (a student opens more lessons in another tab, gets an A1′ threshold denial, and is
  auto-approved on day 14 with the admin absent); then the lesson-deletion nuance and two rules,
  recommending V1 (threshold or account-limit denial never auto-approved)
- **My decisions:** I proposed showing the appeal only after a denial, read the comparison and kept
  V3; chose to close the tab race under T11 with V1
- **How I verified:** *Not verified by me*
- **Verdict:** OQ-1 recommendation `rejected`; T11 amendment `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — EC-8 wording
- **Stage:** specification (Edge cases, EC-8)
- **Context the AI had:** EC-8, Q16, AC-C2
- **AI proposed:** that EC-8 already said "the amount paid is refunded" and AC-C2 enforces it; a
  wording that also covers a lowered price or a course made free
- **My decisions:** the principle: a bought course is the student's, a later price change affects
  nothing; accepted the wording
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Full spec review; DL: a lost bank dispute
- **Stage:** specification (whole-spec review before approval)
- **Context the AI had:** the full `spec.md`, `security.md`, ADR-037 §1/§3, `decisions.md` (OQ-2,
  T11), Analysis E4
- **AI proposed:** a review list: open decisions (lost dispute, FR-P3 batch size, Branch C text, six
  **[AI]** rules), five mechanical inconsistencies, process items; for the lost dispute, three
  options and a recommendation of V2 (another refund path, counting for D3 and the account limit)
- **My decisions:** V2
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — BATCH: release job batch size
- **Stage:** specification (FR-P3)
- **Context the AI had:** ADR-037 §3, Vercel Hobby limits (Constraints), FR-P15, FR-P22, FS-6
- **AI proposed:** a per-payment estimate (~1.5 s, 2–3 Stripe calls; not measured); options 25/50/100;
  a recommendation of 50 with a revisit trigger of 3 days in a row at the limit
- **My decisions:** 50
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — C-TEXT: the student text when a refund fails at Stripe
- **Stage:** specification (User flow Branch C, FR-S20)
- **Context the AI had:** Branch C, FR-S20, AC-C23
- **AI proposed:** that FR-S20/AC-C23 already settle the short text; a fuller fixed text with a
  3-day promise, and an admin reminder on day 3 so the promise has a trigger
- **My decisions:** the text and the day-3 reminder
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — The [AI] rules confirmed; EC-17 rewritten
- **Stage:** specification (FR-A1, FR-P18b, EC-4, EC-11, EC-16, EC-17, notifications)
- **Context the AI had:** the nine **[AI]** markers in `spec.md`, D-12, DC, D3, DL
- **AI proposed:** a recommendation per rule; for EC-17, that "allowed while disputed" cannot happen
  (an open dispute leaves the enrollment active, so DC blocks a repurchase) and a rewrite by dispute
  outcome
- **My decisions:** confirmed all nine; accepted the EC-17 rewrite
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — User flow review
- **Stage:** specification (User flow, reviewed section by section)
- **Context the AI had:** the User flow, FR-S2, FR-S15, FR-A2, FR-P27, EC-10 and today's decisions
  (DL, C-TEXT)
- **AI proposed:** seven findings: step 3 missing the dispute condition; Branch E missing a lost
  dispute; A4 approve not re-checking certificate/dispute (UF-3, options a/b, recommended a); the
  admin flow missing the lost-dispute email, the day-3 reminder and the FR-P27 outcomes; the
  instructor flow missing a dispute lost after release; appeal files mandatory or not (UF-6,
  recommended optional); a stale "Open questions" heading
- **My decisions:** all seven as recommended; I mark the User flow as reviewed
- **How I verified:** read the section with the AI's findings
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Functional requirements review
- **Stage:** specification (Functional requirements, reviewed section by section)
- **Context the AI had:** the FR section, ADR-037 §1, the notification matrix, today's decisions
- **AI proposed:** FR-P13 missing a lost dispute; FR-P2a missing the dispute condition of the ADR
  predicate; a stale snapshot term in FR-S5; FR-S21 shorter than the notification matrix; a
  closed-list reason on appeals (FR-1, options a/b, recommended a); regrouping Launch into Launch,
  Account deletion and Guards without renumbering
- **My decisions:** all as recommended, (a) for FR-1; I mark the FR section as reviewed
- **How I verified:** read the section with the AI's findings
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Edge cases review
- **Stage:** specification (Edge cases, reviewed section by section)
- **Context the AI had:** EC-1…EC-18, UF-3, FR-A6, OQ-7a, AC-C2, ADR-025
- **AI proposed:** EC-10 aligned with UF-3; EC-16 extended to an admin exception; a request after a
  partial Dashboard refund (EC-19, options a/b, recommended a); the instructor deleting their account
  during the hold (EC-20, already decided by ADR-025)
- **My decisions:** all as recommended, (a) for EC-19; I mark the Edge cases as reviewed
- **How I verified:** read the section with the AI's findings
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Failure scenarios review
- **Stage:** specification (Failure scenarios, reviewed section by section)
- **Context the AI had:** FS-1…FS-13, C-TEXT, FR-P18a/b, FR-A10, the 30-day event retention constraint
- **AI proposed:** FS-1 aligned with C-TEXT; FS-4 covering dispute events; FS-14 for a replay gap over
  30 days (closed by the 48 h alert); FS-11 "Open" reworded as fail-open; a note that the day-3 email
  is not retried, with a recommendation not to add email retries
- **My decisions:** all as recommended; I mark the Failure scenarios as reviewed
- **How I verified:** read the section with the AI's findings
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Alternatives, Trade-offs and Decision review
- **Stage:** specification (Alternatives, Trade-offs, Decision)
- **Context the AI had:** the three sections, `decisions.md` A1/A3/A8
- **AI proposed:** recomputed the A1, A3 and A8 matrices and sensitivity claims (all correct); found
  "~2% of revenue" lost the word "platform" (≈0.35% of total sales); the decisions list missing
  today's decisions; a DL bullet in Decision
- **My decisions:** all as recommended; I mark Alternatives as reviewed
- **How I verified:** read the sections with the AI's recomputation
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Acceptance criteria review
- **Stage:** specification (Acceptance criteria, last of the six draft sections)
- **Context the AI had:** every FR, EC-17, EC-20, `security.md` numbering
- **AI proposed:** traced every FR to an AC; six gaps closed by AC-F24…F27, an extended AC-F7 and two
  rows in the test table; the AC-C10/C27/L5/L6 gaps left as explained in `security.md`
- **My decisions:** all as proposed; I mark the Acceptance criteria as reviewed
- **How I verified:** read the section with the AI's trace
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Spec condensed and best-practice gaps filled
- **Stage:** specification (whole spec, after the section-by-section review)
- **Context the AI had:** the full `spec.md`, `decisions.md`, the `/plan` command, and a web review of
  spec practices (Google design docs, Rust RFC, Amazon PR/FAQ, GitHub Spec Kit, Kiro/EARS,
  ISO/IEC/IEEE 29148)
- **AI proposed:** first, moving FR and AC into sibling files; I rejected that because `/plan` reads
  only `spec.md` and `security.md`, so the spec must keep everything the plan needs. Instead: condense
  the User flow into a diagram plus steps that cite the FRs (exact UI texts moved into FR-S8, S11,
  S13, S20, S23, FR-P7, P17, FR-A8); move the OQ table and the list of spec-time decisions to
  `decisions.md`; add a short summary, Success metrics, FR priorities, the Scope/M0 alternative and a
  "What these decisions make worse" list. It also found two consequences `decisions.md` handed to the
  spec that no section covered: the stored Stripe fee (A8 → FR-P28, AC-F28) and the weekly chart
  after a refund (D2 → A11, left **[open]**)
- **My decisions:** keep everything the plan needs in `spec.md`; apply the recommended additions
- **How I verified:** *Not verified by me*
- **Verdict:** `partially accepted` (the sibling files were rejected)
- **Why:** *TODO (me)*

### 2026-11-21 — A11: study statistics after a refund
- **Stage:** specification (Ambiguities A11, FR-P9)
- **Context the AI had:** D2 in `decisions.md`, `lessonProgress.repository.ts`, `student.service.ts`
- **AI proposed:** that the open "weekly chart" question is wider: the chart, the weekly delta, the
  streak, study days and the live-computed achievements all read the deleted `LessonProgress`, and
  D2's counter keeps only lifetime minutes. Options V1 live only, V2 per-day archive without the
  course, V3 keep rows marked; recommended V2
- **My decisions:** V2
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — In short and Success metrics review
- **Stage:** specification (Description "In short", Business / user value "Success metrics")
- **Context the AI had:** both blocks, the revisit triggers in `decisions.md` (A1, Q13, A3, A8,
  OQ-1, OQ-2), FR-S5, FR-S8, FR-S13, FR-A1, AC-F8, AS-8
- **AI proposed:** the Q13 and A3 triggers, written before OQ-1, measure refusals that no longer
  exist (a threshold breach is a direct appeal; after the window there is no button), so restate
  them; add the missing A1 and OQ-2 triggers; mark the automatic-share row as context only; a gap:
  a direct appeal stores no snapshot although the queue and the metrics need one; in "In short",
  course-deletion protection is a precondition (AS-8), not "not done", one of the three leaks is a
  certificate, not money, and FR-P19a and Scope/M0 were missing
- **My decisions:** all accepted; the A3 trigger is computed from data (0 opened lessons at window
  close), not from a new logged event; the snapshot is stored when a direct appeal is filed
- **How I verified:** read both blocks with the findings
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Description review
- **Stage:** specification (Description paragraph)
- **Context the AI had:** the Description, FR-S13 (OQ-1), FR-P2a, FR-P7, the Decision section
- **AI proposed:** two statements had drifted from later decisions: "appeal a denial" (after OQ-1
  most appeals are direct, with no denial) and "a refund never claws back" (a Dashboard or exception
  refund after release does, FR-P7); name the 14 days
- **My decisions:** the rewrite
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Priority review
- **Stage:** specification (Functional requirements "Priority", FR-P20)
- **Context the AI had:** the Priority table, FR-P2a, FR-P10, FR-P20, FS-5, FS-14, S2 in `decisions.md`
- **AI proposed:** disputes were P2 although the table's own P1 definition (money still leaks) fits
  them; payout monitoring FR-A8–A10 belongs in P1 because FS-5/FS-14 rely on its alert; P1–P3 are an
  importance ranking, not separately shippable releases; FR-P20 named only the hold and FR-P19/P19a
  for day 0, while Dashboard refunds between day 0 and day 14 need the refund effects, disputes and
  monitoring
- **My decisions:** move disputes and FR-A8–A10 to P1; add a Ships column (Day 0 / Day 14), expand
  FR-P20 and add AC-F30
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Scope/M0 review: M4 scored in the A1 matrix
- **Stage:** specification (Alternatives, Trade-offs, Decision for A1)
- **Context the AI had:** the Scope/M0 row and Decision bullet, A1 in `decisions.md` (options,
  matrix, sensitivity)
- **AI proposed:** M0 duplicated M4 (manual review of every request), which A1 had rejected in one
  word without scoring; the admin-load argument depends on a request volume that does not exist; the
  claim "the hold is most of the money work" was unsupported. Drop M0, score M4 in the A1 matrix
  (−2 vs 9) with a sensitivity check: M4 wins only at a K5 weight above 4.75, or 3.25 with K2 = 0
- **My decisions:** merge M0 into M4; accept the M4 scores as proposed
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Drawbacks review: the 31-day bound
- **Stage:** specification (Trade-offs "What these decisions make worse", Business / user value,
  Decision A3, ADR-037)
- **Context the AI had:** the drawbacks list, T11 and its "What I give up", OQ-5, D2, FS-3, OQ-4,
  AS-8, AI-C6
- **AI proposed:** the "≈ 31 days worst case" promised in four places no longer holds after T11 (a
  direct, threshold or limit appeal is never auto-approved, so the money is held until the admin
  decides), which T11's own "What I give up" already says; add the missing drawbacks (progress
  erased, no refund feedback for instructors, courses with purchases cannot be deleted, AI-C6)
- **My decisions:** rewrite the bound honestly everywhere, amend ADR-037; mechanics unchanged.
  Raised by me in the same step: the refund UI should not sit on the course page (see the next entry)
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — UI-1: the refund UI moves to the Purchases page
- **Stage:** specification (User flow, FR-S, AC, `security.md` C1)
- **Context the AI had:** the student FRs and ACs, `app/dashboard/billing/page.tsx`, the billing spec
- **Raised by me:** no permanent refund text or appeal button on the course page; refunds are not the
  core of the product; put the rules in a tooltip or the purchase policy and the refund logic in a
  separate place
- **AI proposed:** three placements with mock-ups; recommended the existing Billing page (renamed
  Purchases) with a quiet row action, a tooltip, a refund page per purchase and "Ask an admin to
  review" as the next step on that page; no promised decision date; the repurchase warning at checkout
- **My decisions:** the recommended placement
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — FR-P28 review: the Stripe fee record
- **Stage:** specification (FR-P28, AC-F28, Failure scenarios, Agent notes)
- **Context the AI had:** FR-P28, `payment.service.ts` `finalizeCheckout`, the `Payment` model
- **AI proposed:** FR-P28 did not say what happens when the fee cannot be read (it is a measurement,
  so it must not fail the checkout); read it from the charge already fetched for `paidAt`; payments
  before day 0 are not backfilled; currency is USD only. Options for a failed read: fill in by the
  daily job, or leave it empty
- **My decisions:** fail open, the daily job fills in missing fees
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Test & eval scenarios review
- **Stage:** specification (Test & eval scenarios, Acceptance criteria order)
- **Context the AI had:** the table, all 68 acceptance criteria, the project's test levels (no
  `*.test.tsx`, no end-to-end tests)
- **AI proposed:** add an AC column so coverage can be checked; cover the new criteria (AC-F8, F28,
  F29, F30, UI-1) and the uncovered old ones (AC-F21, C17, C25, L1, L3, L4, C1 by payment id); a
  manual row and a release-checklist row; sort the ACs by number. For UI criteria: pure state
  functions with unit tests plus a manual check at `/qa`, component tests, or end-to-end tests
- **My decisions:** pure functions + manual check; the rest as proposed
- **How I verified:** *Not verified by me* (the AI's script confirmed every AC appears in the table)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Source of truth review
- **Stage:** specification (Source of truth, frontmatter `depends-on`)
- **Context the AI had:** the section, `documentation-process.md` §1a and §2, the list of feature specs
- **AI proposed:** name both ADR-037 amendments (and note §1a: ADRs are not edited after a change;
  both amendments are pre-release corrections, not reversals); "frozen" must except the author's
  «why» notes; add the AI decision log and the discovery evidence; a rule for the 11 other specs whose
  behaviour this feature changes
- **My decisions:** a table of the 11 specs with the rule "this file governs until release; each is
  updated at `/qa`", and `depends-on` extended to them
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — Agent notes review
- **Stage:** specification (Agent notes)
- **Context the AI had:** the section, `payment.service.ts`, `lesson.service.ts`,
  `lessonProgress.repository.ts`, `vercel.service.ts`
- **AI proposed:** replace the preconditions list with a pointer to the Release checklist (one list,
  not two); one note for where `decisions.md` is older than the spec; refunds are recovered by
  `payment_intent`, not `transfer_group`; add gotchas seen in code: two transfer calls in
  `finalizeCheckout`, `touchLastAccessed` fails open, `CourseProgress` is dead, archive day bucketing
  must match the chart query
- **My decisions:** accepted as text edits
- **How I verified:** *Not verified by me*
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-21 — The spec holds the requirements; the design record moves beside it
- **Stage:** specification (structure)
- **Context the AI had:** the IDP "Requirements Analysis" list (problem statement, value, user flow,
  functional and non-functional requirements, assumptions, constraints, edge cases, failure
  scenarios, acceptance criteria; requirements an AI would not know), `spec.md`,
  `specSections.contract.test.ts`, `documentation-process.md`
- **Raised by me:** the spec should look like the IDP list; move discovery and the rest into
  separate files
- **AI proposed:** keep the IDP sections (plus Description, Unsupported use cases, Test & eval, Agent
  notes, Source of truth) in `spec.md`; Discovery + Ambiguities → `discovery/findings.md`;
  Alternatives + Trade-offs + Decision → `discovery/decision-summary.md`; one-line stubs in the spec,
  or a contract-test change. Also: expand Non-functional requirements with numbers, and frame Agent
  notes as the context an AI would not know
- **My decisions:** change the test (sibling files count when they carry the heading) instead of
  stubs; the rest as proposed
- **How I verified:** *Not verified by me* (the test failed with the sections removed and passed
  once the files existed)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 1 plan: six decisions the spec did not make (P1–P6)
- **Stage:** implementation (planning)
- **Context the AI had:** the approved `spec.md`, `security.md`, the constitution, and codebase
  anchors gathered by a code-explorer agent (`build/plan.md` → Codebase anchors)
- **Raised by me:** cut the slice to the automatic decision only (no Stripe, hold, cron, UI) for the
  IDP review
- **AI proposed:** P1 stop at `auto_approved` (no money moves); P2 `hasOpenDispute` always false until
  the disputes slice; P3 a lesson in a soft-deleted section counts as deleted; P4 `paidAt` null →
  outside the window, no backfill from `createdAt`; P5 free text capped at 2000 characters; P6 a
  certificate = an enrollment with `completedAt` set
- **How I verified:** P3 and P6 came from the code, not the spec — there is no certificate table
  (`certificate.service.ts:12-43` renders from completed enrollments) and sections have their own
  `deletedAt` (`course.prisma:72-86`). *The rest not verified by me.*
- **My decisions:** accepted all six (2026-11-22)
- **Verdict:** `accepted`
- **Why:** *(drafted by AI, edited by me)*
  - **P1:** the decision logic is where my own decisions (A1, Q13) live, so it is what the slice has
    to show; moving money before the payout hold exists would reopen the leak ADR-037 closes. With
    the flag off, nothing reaches a student.
  - **P2:** no dispute state is stored anywhere; a fake source would hide the gap. Writing the rule
    now means the disputes slice only has to supply data.
  - **P3:** a lesson in a deleted section is invisible to the student; counting it in L would raise
    the threshold with lessons nobody can open. Same principle as EC-3: the instructor's deletion
    falls on the instructor.
  - **P4:** `createdAt` is when the checkout was created, not when the payment happened; a session
    can be paid up to 24 h later, so a backfill would start the window early and cut the student's
    time. A backfill would not change any outcome anyway: payments made before slice 1 have no
    `paidAt`, and the button turns on at least 14 days after deploy (FR-P20), so every such payment
    is already outside the window. This only holds if the flag goes on 14 days or more after
    `paidAt` starts being recorded, which is now a Release checklist item.
  - **P5:** the spec asks for a cap (C22) but gives no number; 2000 characters is enough for a
    paragraph of reason, and the number is easy to change.
  - **P6:** the code has no certificate table; certificates are rendered from a completed
    enrollment, so that is the source of truth. The spec assumed an entity that does not exist.

### 2026-11-22 — Slice 1 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan.md`, executed task by task with TDD
- **AI found while implementing:**
  - `BaseRepository.transaction` wraps every error into a plain `Error`, so `NOT_FOUND`/`CONFLICT`
    were lost (5 tests red) → the service uses `db.$transaction` directly;
  - under `SKIP_ENV_VALIDATION` (all tests) `lib/env.js` returns raw strings, so a boolean flag
    check was always off → the flag compares as a string;
  - the dev database has drift (`concept_mastery_archive_le2`, 5 rows) that `prisma migrate dev`
    would drop → the migration was generated with `prisma migrate diff` from the committed schema;
  - break-it check: with the per-student lock removed, AC-C4 (three concurrent requests at the
    account limit) fails; AC-C3 still passes on the unique key alone
- **How I verified:** *Not verified by me* (the tests named in `build/plan.md` ran red, then green)
- **Verdict:** `accepted`
- **Why:** *(drafted by AI, edited by me)* each change was forced by a fact in the code that a
  failing test revealed, not by preference: error codes were lost, the flag was always off, and
  `migrate dev` would have dropped dev data. I accepted the lock only after the break-it run: without
  it the account-limit test fails, so the lock is required, not just defensive.

### 2026-11-22 — Slice 1 /qa: what the review and the audits changed
- **Stage:** validation
- **Context the AI had:** the branch diff (26b9716..590d41a), `build/plan.md`, `spec.md`,
  `security.md`, the contract tests; one code reviewer and two security auditors
  (`security-auditor`, `llm-security-auditor`), each in a fresh context
- **AI found:**
  - code review — `markLessonComplete`/`markLessonIncomplete` reused `getStudentLesson`, so marking
    a lesson recorded it as opened, against FR-P19 ("marking is unchanged") → fixed: the access check
    no longer records for those callers (`fix(lesson)` 804938b);
  - code review — the account limit looked back 365 days, the spec says 12 months → fixed: 12
    calendar months in UTC (`fix(refund)` 7c0f477);
  - security audit, Low — `paymentId` had no length cap; a NUL byte in the text gave a 500 → fixed
    (3bd5e6f);
  - security audit, test gap — nothing pinned "another student's payment that already has a request
    returns NOT_FOUND, not CONFLICT" (an existence oracle after a refactor) → test added, proved by a
    mutation that moves the duplicate check before the ownership check (3bd5e6f);
  - security audit, Medium before flag-on — waiting on the per-student lock holds pool connections;
    no rate limit → accepted for slice 1 only, a Release checklist item (`security.md`);
  - security audit — refund text is not erased on account deletion (C29); access continues after
    an automatic approval → accepted for slice 1 only, Release checklist items;
  - LLM audit — no findings; refund and opened-lesson code is not reachable from any AI entry point
- **AI proposed:** keep `status: in-progress` (slice 1 of many); amend ADR-037, which rejects an
  advisory lock "around the Stripe call", to say the slice's lock has no network call inside
- **How I verified:** *Not verified by me* (each fix: test red, then green; full suites green —
  unit 2466/2466, integration 481/481)
- **My decisions:** do not push the branch yet; it is merged as one module at the end
- **Verdict:** `accepted`
- **Why:** *(drafted by AI, edited by me)* my rule: fix anything that disagrees with the spec, or
  that is cheap and testable; accept only what cannot be reached while the flag is off, and write it
  down as a release condition, not as "later". The branch is not pushed because the feature merges
  as one module, and slice 1 alone does not keep the refund promise.

### 2026-11-22 — Validation: the AI draft of 2026-11-02 against what I decided
- **Stage:** validation
- **Context the AI had:** the sealed archive `~/Downloads/refund-archive-2026-11-02/` (opened today
  for the first time: `epics/refund-self-service.md`, `ai-decision-log.md`), `spec.md`,
  `decision-summary.md`, `decisions.md`, `findings.md`, `discovery.md`
- **AI proposed (on 2026-11-02, before my discovery):** an epic of six specs with eight cross-cutting
  decisions X1–X8. The comparison:

  | # | AI draft (2026-11-02) | My decision | Verdict |
  |---|---|---|---|
  | X1 | An admin decides every request; automatic approval explicitly out of scope | Rules decide, the admin sees appeals only (A1, M3b: 9 vs M4 −2) | `rejected` |
  | X2 | Hold the instructor's share until the window closes | Same (ADR-037); plus Stripe cannot hold it for our charge model (D-15), compare-and-set, daily job | `accepted`, deepened |
  | X3 | 14 days, configurable | 14 days from payment; worst-case instructor wait ≈ 31 days, open-ended while an appeal waits (T11) | `accepted`, deepened |
  | X4 | No refund after a certificate or above X% of **completed** lessons, X from an experiment | **Opened** lessons, `min(3, ⌊L/2⌋)` (Q13); "complete" is a student-set mark and can be skipped | `modified` |
  | X5 | An admin may refund outside the policy with a written explanation | Same (FR-A6, C3.1); refined: does not use up the student's refund or the account limit (OQ-3), revokes a certificate with reason "admin exception" (E2); plus one appeal per purchase | `accepted`, refined |
  | X6 | A refund after the window: the instructor's share becomes debt from future payouts, no reversal attempt, because "a reversal fails without balance" | The transfer is reversed; if the instructor withdrew, the platform covers the negative balance (FR-P7, D-6). A debt mechanism was rejected for complexity (A8, V3) | `rejected` — premise false |
  | X7 | An approved refund always revokes the certificate | Same, as an explicit revocation field with a reason, not by clearing `completedAt` (E2) | `accepted`, refined |
  | X8 | The instructor sees every refund and its reason | No refund reasons for instructors (OQ-4, FR-I2, Unsupported) | `rejected` |
  | — | An epic of six specs | One spec, built in slices | `modified` |

- **Missed by the AI draft** (`missed-by-ai`): AI features must serve content only from opened
  lessons, or the threshold means nothing (FR-P19a); who bears the Stripe fee — the fact was there
  (D5), the decision was not (A8); a lost bank dispute as a refund path — the draft put disputes out
  of scope (DL); the transition for purchases made before launch (S2, phased launch); progress after
  a refund (D2); course deletion (AS-8); the account limit stayed an open question (D3).
- **The strongest case — X6, the AI was wrong twice:** first from memory ("the balance goes negative
  and Stripe collects"), then after research ("a reversal fails without available balance", logged
  in the archive as the correction). The researched answer was incomplete too: the quoted sentence is
  the general case and ignores the account's configuration. My sandbox check found
  `controller.losses.payments: "application"` (Q25), under which the reversal goes through and the
  platform covers the negative balance (Q9). X6's design rested on the false premise.
- **How I verified:** *Not verified by me* — the table and the missed list were drafted by the AI;
  X5 and X6 were re-checked by the AI against `spec.md:173,341,400`, `decisions.md:412,1017`,
  `discovery.md:140,156` after I questioned them
- **Verdict:** see the table
- **Why:** *TODO (me): in my own words — why X1 and X8 flipped, why opened and not completed lessons
  (X4), and what X6 taught me about trusting "AI + a docs link"*

### 2026-11-22 — Validation: slice 1 acceptance criteria against the tests
- **Stage:** validation
- **Context the AI had:** `spec.md` (AC-F2–F6, AC-C1–C4, C9, C22, C24), `build/plan.md` (Self-review,
  Final verification), the nine test files of the slice
- **AI did:** mapped each slice-1 AC to the tests that prove it and ran them — 9 files, 93/93 green
  (unit + integration on `learnix_test`, 2026-11-22)

  | AC | Tests | Coverage |
  |---|---|---|
  | AC-F2 | `refundRules.test.ts:63,112`, `refund.service.integration.test.ts:100` | Partial: decision + snapshot; "refunded at once" → Stripe slice (P1) |
  | AC-F3 | `refundRules.test.ts:27`, `openedLesson.repository.integration.test.ts:35,45,59` | Full |
  | AC-F4 | `refundRules.test.ts:43,47,52`, `refund.service.integration.test.ts:147` | Full ("judged at submission" has no own test: the service takes `now` at the request) |
  | AC-F5 | `refundRules.test.ts:100`, `refund.service.integration.test.ts:123,184` | Partial: denial names the condition; page text and "Ask an admin" → UI slice |
  | AC-F6 | `refund.service.integration.test.ts:234`, `refundSchema.integration.test.ts:44` | Partial: one request; the appeal → appeals slice |
  | AC-C1 | `refund.service.integration.test.ts:202,212`, `refund.integration.test.ts:37` | Partial: request endpoint, incl. no existence oracle; page, appeal, status → later slices |
  | AC-C2 | `refund.dto.test.ts:14` (`.strict()`) | Partial: extra input keys rejected; `refunds.create` args → Stripe slice |
  | AC-C3 | `refund.service.integration.test.ts:243` | Partial: one row; one `refunds.create` → Stripe slice |
  | AC-C4 | `refund.service.integration.test.ts:259` + break-it run (red without the lock) | Full |
  | AC-C9 | `openedLessonRecord.integration.test.ts:32,40,51` | Partial: lesson page, fail closed, marking does not record; tutor → FR-P19a slice |
  | AC-C22 | `refund.service.integration.test.ts:291`, `refund.dto.test.ts:30,45` | Partial: stored as typed, length cap, NUL rejected; rendering → UI/admin slices |
  | AC-C24 | `refund.service.integration.test.ts:281`, `refundFlag.test.ts` | Partial: request endpoint; appeal → appeals slice |

  Also pinned by tests, not ACs: P4 (`paidAt` null → outside, `:157`), P6 (certificate = completed
  enrollment, `:137`), `paidAt` from the Stripe charge (`payment.service.test.ts`), 12 calendar
  months for the account limit (`refundRules.test.ts:146`).
- **Result:** 3 ACs fully covered, 9 within the slice; every deferred part was named in the plan
  before coding. No disagreement between code and spec found. Against the problem: slice 1 does
  **not** solve it yet — no money is returned, the hold and FR-P19a are not built, and the Release
  checklist (AC-L8) keeps the flag off until they ship. The slice proves the automatic decision only.
- **How I verified:** *Not verified by me* — the mapping and the run were done by the AI
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why "partial" is acceptable for slice 1, and why a green
  slice still does not mean the problem is solved*

### 2026-11-22 — Validation: the assumptions after slice 1
- **Stage:** validation
- **Context the AI had:** `spec.md` Assumptions (AS-1–AS-8) and Release checklist, the slice-1 code
  and tests, the local dev database `learnix` (7 courses)
- **AI did:** gave each assumption a state and rechecked AS-3 against the data:

  | # | State on 2026-11-22 | Basis |
  |---|---|---|
  | AS-1 reasons | Not verified | No users; reasons are now stored in `refund_requests.reason` (closed list), so they can be counted after launch |
  | AS-2 guarantee sells | Not verified | Conversion before/after launch only; if false, the leaks are still closed |
  | AS-3 lesson 3 is substantive | **Partly false, in the student's favour** | See below |
  | AS-4 admin time | Not verified | No appeals yet (later slices) |
  | AS-5 opened ≈ consumed | Not verifiable by design | Slice 1 fixed the definition only: "opened" = the server returned the content (`openedLessonRecord.integration.test.ts:32`) |
  | AS-6 `losses.payments` live | Not verified — release gate | Sandbox checked 2026-11-08 (Q25); Release checklist (`spec.md:904`) |
  | AS-7 Vercel Hobby terms | Not verified — release gate | Release checklist |
  | AS-8 no deletion of bought courses | Not built — release gate | Separate feature; without it L = 0 (T27) |

  **AS-3 by lesson titles:** lessons 1–2 are intro/setup in all 7 courses. Lesson 3 is substantive in
  3 of 7 (React "Creating Your First React App", Angular "Understanding Angular CLI", Drizzle
  "Understanding the Architecture") and still intro/setup in 4 (Basic "Introduction to Prisma",
  Digital Marketing "Overview of … Channels", UI/UX "Overview of Design Thinking", tRPC "Setting Up
  Your Development Environment"). So the threshold of 3 errs towards letting a student who saw only
  the intro get a refund, not towards blocking one.
- **Options:** (a) record the finding, keep the threshold, rely on the revisit triggers; (b) reopen Q13
- **How I verified:** the AI read the titles; I agreed with its reading of lesson 3 per course
- **My decision:** (a) — `spec.md` AS-3 updated
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why a lenient error is acceptable and why seed data does not
  justify reopening Q13*

### 2026-11-22 — Slice 2 plan: nine decisions the spec did not make (H1–H9)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-P1–P5, P2a, P24–P26; `security.md` C5–C7, C14–C16, C28;
  ADR-037; codebase anchors from one `feature-dev:code-explorer` pass
- **AI proposed:**
  - H1 — `paidAt` null → eligible at `createdAt` + 24 h + 14 d + 1 h (a Checkout Session expires
    within 24 h, so the bound is never early; legacy sales are still paid);
  - H2 — an `auto_approved` request blocks release until slice 3 makes the refund;
  - H3 — appeal right = `auto_denied` and now < max(window end, denial + 3 d); no appeals table yet;
  - H4 — a live charge refunded or disputed → back to `pending`, recorded as a run failure, no effects;
  - H5 — a Stripe error after the claim leaves `transferring`; the next run lists before retrying;
  - H6 — the migration moves legacy `succeeded` + `none` (net > 0) to `pending`;
  - H7 — Redis run lock with a token, 15 min TTL, in-memory fallback only in dev/test;
  - H8 — one constant-time Bearer comparison shared by the cron and n8n routes;
  - H9 — the checkout path makes no transfer at all (AC-C14 over FR-P2's wording)
- **AI found while planning:** `getSessionStatus` finalized any student's checkout session (no
  ownership check) — the C28 gap was real in the code, not only a threat on paper
- **How I verified:** *Not verified by me* — I read the table and approved H1–H9 as proposed
- **My decision:** approved all nine; H1 and H7 recorded as an ADR-037 amendment
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why H1 uses createdAt + 24 h instead of holding forever,
  and why H6 backfills old rows instead of leaving them*

### 2026-11-22 — Slice 2 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-2.md`, executed task by task with TDD
- **AI found while implementing:**
  - the candidate query had to use the same predicate as the claim, or payments blocked by an
    approved request (H2) would fill every batch of 50 and starve the rest;
  - removing the old Sweep broke the admin button at typecheck, so Tasks 8 and 9 shipped as one
    commit to keep every commit green;
  - the signed checkout webhook also calls `finalizeCheckout` and has no student, so the ownership
    check became a separate `finalizeCheckoutForStudent` instead of a new parameter;
  - `CRON_SECRET` is optional in env (≥ 32 chars when set) so dev and `next build` work; without it
    the route refuses everyone — a deploy without the secret never pays out, which slice 5's 48 h
    alert must catch;
  - the contract test's first regex mis-read `if (` and `retrieve(` as function names; it now reads
    declarations line by line;
  - break-it runs: dropping `NOT EXISTS` turns the appeal/approval tests red; a second
    `transfers.create` turns the contract test red; a transfer at sale turns AC-F13 red
- **How I verified:** *Not verified by me* (the tests named in the plan ran red, then green; unit
  2500/2500)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 2 final review and /qa: what the reviews and the audits changed
- **Stage:** validation
- **Context the AI had:** the slice-2 diff (4f13627..), `build/plan-slice-2.md`, `spec.md`,
  `security.md`, ADR-037; one fresh code reviewer (Opus) and two auditors (`security-auditor`,
  `llm-security-auditor`), each in its own context
- **AI found:**
  - review, Critical — sales that cannot be paid (no account, a disputed charge) headed every batch
    of 50, so payouts could stop for everyone with no failure reported → fixed: candidates leave out
    unpayable instructors and are taken least recently touched first (54e3f6b);
  - review, Important — recovery checked the charge before looking for a transfer Stripe had already
    made, so a disputed charge could send a paid row back to `pending` → fixed: existing transfer
    first (54e3f6b);
  - review, Important — a pre-slice-2 transfer has no `transfer_group`, so a legacy sale whose DB
    write was lost could be paid twice → fixed: lookup by source charge (54e3f6b); the audit then
    found that lookup read only one page of 100 → fixed: all pages;
  - audit, Low — a refund on a `transferring` row was counted as "released" → now reported as a
    failure that needs a reversal; rows that keep failing headed the batch again → touched on failure;
  - audit — all seven controls (C5, C6, C7, C14, C15, C16, C28) implemented; no Critical/High;
  - LLM audit — no AI surface touched, no path from payout data to a model
- **Accepted for slice 2 only:** refunded held sales stay `pending` until slice 3; the
  `account.updated` path is unbounded and noisy; two count-only issues; the contract test is a
  tripwire; a missing `CRON_SECRET` fails closed silently (all in `security.md`)
- **How I verified:** *Not verified by me* (each fix: a test that failed first, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 3 plan: eleven decisions the spec did not make (R1–R11)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-P6–P15, FR-S6, FR-S20; `security.md` C2, C3, C5, C7, C8, C12,
  C25, C26, AI-L13; ADR-037 §4; codebase anchors from one `feature-dev:code-explorer` pass
- **AI proposed:**
  - R1 — the request stores its refund state (`processing` / `refunded`), the Stripe refund id and
    Stripe's error for the admin only;
  - R2 — a partial `charge.refunded` applies no effects yet (FR-P16 later);
  - R3 — a disputed charge is not refunded; the request stays `processing` ("charge disputed");
  - R4 — a fourth revocation reason, `refund_request`, for a course completed while its refund was
    processing;
  - R5 — a repurchase clears the revocation and reopens the conversation;
  - R6 — the replay cursor lives in its own table; the first run starts 30 days back; only
    `charge.refunded` for now;
  - R7 — the job retries processing refunds (20), then replays, then releases;
  - R8 — completed-course counts are not reduced by revocation (A11);
  - R9 — the unawaited progress sync never touches a cancelled enrollment;
  - R10 — legacy `auto_approved` rows become `processing`;
  - R11 — the review is hidden on every path
- **AI found while planning:** the certificate list and PDF ignored enrollment status (a refunded
  student kept a downloadable certificate); messaging `send` checked no enrollment; the progress sync
  could revive a refunded enrollment and re-issue its certificate; every study statistic was derived
  from the rows a refund deletes
- **How I verified:** *Not verified by me* — I read the table and approved R1–R11 as proposed
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why R2 changes today's behaviour for partial refunds, and
  why a repurchase should reopen the conversation (R5)*

### 2026-11-22 — Slice 3 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-3.md`, executed task by task with TDD
- **AI found while implementing:**
  - the "correct quiz answers" achievements count quiz attempts, which a refund deletes — the archive
    gained a `correct_answers` column (a second migration) so A11 holds;
  - archive days are UTC midnights while week/month windows are server-local — exact on UTC servers
    (Vercel), cosmetic drift on a non-UTC dev machine;
  - a duplicate purchase (DC) must keep the records, certificate, conversation and review, not only
    the enrollment — only the payment, its share and its request change;
  - a reversal that fails after the effects commit is retried by the daily job (logged, not thrown);
  - a repeat request on a refunded payment stays CONFLICT (AC-F6), so the payment lookup also finds
    refunded payments; a Dashboard-refunded payment with no request is NOT_FOUND;
  - replay re-reads the cursor's last second (`gte`), so events sharing a second are never skipped;
  - break-it runs: dropping the effects CAS guard turns the race test and the end-to-end "late
    webhook changes nothing" test red
- **How I verified:** *Not verified by me* (each task's test ran red, then green; unit 2520/2520)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 3 /qa: what the review and the audits changed
- **Stage:** validation
- **Context the AI had:** the slice-3 diff (676d718..984a906), `build/plan-slice-3.md`, `spec.md`,
  `security.md`, ADR-037; one fresh code reviewer (Opus) and two auditors, each in its own context
- **AI found:**
  - security audit, **High** — `course.enroll` re-activated a refunded paid course for free, and since
    this slice also un-revoked its certificate and reopened the conversation: refund + access → fixed,
    the student enrol action is for free courses only;
  - review — a refund during a release left the share `pending` (owed balance wrong) → cancelled;
    a partial Dashboard refund counted as full (course revoked, part of the money returned) → the
    remainder is refunded; an effects failure after the Stripe refund errored to the student and one
    failing retry stopped the daily job → contained;
  - security audit — a missing `await` let a failed reversal abort the payout run; requests that can
    never finish starved the refund retry → fixed;
  - review / audit, Low — self-service refunds revoked as "dashboard_refund" when the webhook won →
    fixed; the archive day for correct answers depended on the DB time zone → fixed;
  - LLM audit, Low — tutor history, the pending check and the learning path relied on deletion alone
    → they now require a live enrollment;
  - all slice-3 controls (C2, C3, C5, C7, C8, C12 partly, C23, C25, C26, AI-L13) implemented; C29 still
    open
- **Accepted for slice 3 only:** a Stripe refund failing later (FR-P27), the dashboard certificate
  count, a poison replay event, two reversers vs the lost-dispute rule (slice 4), a restored review's
  date, the non-atomic interest recompute (all in `security.md`)
- **How I verified:** *Not verified by me* (each fix: a test that failed first, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 4 plan: nine decisions the spec did not make (D1–D9)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-P18, P18a, P18b, FR-S2, FR-S11, DL, EC-18; `security.md` C12 and
  the slice-3 risk "two reversers ignore the lost-dispute rule"; ADR-037 §1, §4. No reconnaissance
  agent: every touched surface was written earlier in the same session
- **AI proposed:**
  - D1 — `Payment.disputeState` (open / won / lost) and `disputeUpdatedAt`;
  - D2 — an event older than the stored one changes nothing (webhook and replay arrive out of order);
  - D3 — `Payment.refundSource`, written by the effects function;
  - D4 — D3 and the account limit count distinct payments: approved requests ∪ lost disputes;
  - D5 — a processing request on a payment lost at the bank becomes `refunded_by_bank`;
  - D6 — the release blocks on stored open / lost; Stripe's live `disputed` flag blocks only until the
    stored state is `won` (the flag stays true after a win);
  - D7 — `executeRefund` reads the stored state; Stripe's `charge_disputed` sets it open;
  - D8 — the replay covers four event types under one cursor;
  - D9 — only `lost` returns the money; every other closing status maps to `won`
- **How I verified:** *Not verified by me* — I read the table and approved D1–D9 as proposed
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why a won dispute must not stay blocked by Stripe's flag
  (D6), and why a request lost at the bank counts once (D4)*

### 2026-11-22 — Slice 4 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-4.md`, executed task by task with TDD
- **AI found while implementing:**
  - one parameter carries both the revocation reason and the refund source — the two enums have the
    same four values;
  - `charge_disputed` only sets the state when none is stored, so it never overwrites a won / lost
    dispute; a second dispute after a win is seen through its own event;
  - break-it run: dropping the event-order guard lets a late `dispute.created` reopen a won dispute
- **How I verified:** *Not verified by me* (each task's test ran red, then green; unit 2537/2537)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 4 /qa: what the review and the audits changed
- **Stage:** validation
- **Context the AI had:** the slice-4 diff (28bc29b..fd7fc92), `build/plan-slice-4.md`, `spec.md`,
  `security.md`; one fresh code reviewer (Opus), `security-auditor`, a narrow `llm-security-auditor`
- **AI found:**
  - review + audit (Important / Low) — two dispute events in the same second (e.g. `updated` and
    `closed won` after submitting evidence) could leave the state `open` forever, and the daily replay
    re-applied the wrong order each run → a closed state is never replaced by `open` at a tie, and the
    replay sorts same-second events oldest first;
  - audit (Low) — a lost dispute arriving after Learnix's own Stripe refund (whose effects had failed)
    took the `lost_dispute` path, so the released share was not reversed → it now applies as
    `refund_request`;
  - review (Minor) — a stored `lost` whose effects had not run yet did not block a request → fixed;
    stale comments, the error class location and missing mapping tests → fixed;
  - C12 and DL implemented as claimed; C3, C5, C7, C8, C23 unchanged; LLM audit — nothing
- **Accepted for slice 4 only:** no backfill of disputes older than the first replay, the open product
  question about requests made during a chargeback, inquiries mapped to `open` (all in `security.md`)
- **How I verified:** *Not verified by me* (each fix: a test that failed first — confirmed by reverting
  the fix — then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 5 plan: ten decisions the spec did not make (M1–M10)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-A8–A11, FS-1, FS-5, FS-14; `security.md` C15–C17, C23;
  ADR-037 §3; codebase anchors from one `feature-dev:code-explorer` pass
- **AI found while planning:** a run that crashed left no `PayoutRun` row and no row had a success
  flag, so "the job failed" and "48 h without success" were not observable at all; nothing could
  email admins (no admin address setting)
- **AI proposed:**
  - M1 — a run row from the start; a throw records `error`; unfinished past the lock TTL = crashed;
  - M2 — a successful run is a finished cron/manual run without `error`; per-payment failures are
    problems on the panel, not job failures;
  - M3 — a second daily cron (watchdog) for the 48 h alert and the day-3 reminders; residual risk if
    Vercel Cron itself stops;
  - M4 — recipients: every `ADMIN` user; M5 — de-dup through `notificationLog`, a failed send frees
    its key; M6 — one email per incident, one 48 h email per day;
  - M7 — the day-3 clock starts at the request (automatic approval); M8 — three problem kinds with
    their own Retry; M9 — "coming days" = 7; M10 — CRITICAL templates, no Stripe text to the student
- **How I verified:** *Not verified by me* — I read the table and approved M1–M10 as proposed
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why per-payment failures do not email (M2), and what the
  watchdog cannot catch (M3)*

### 2026-11-22 — Slice 5 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-5.md`, executed task by task with TDD
- **AI found while implementing:**
  - one entry point, `refundOverdue(requestId)`, sends both the admin reminders and the student's
    notice (the plan listed two);
  - both cron routes now share one `isCronRequest` check instead of two copies;
  - the job's constants moved to `payoutJob.constants.ts`, so the pure panel rules import no service;
  - the student's template payload is strict, so no field carrying error text can be added by mistake
- **How I verified:** *Not verified by me* (each task's test ran red, then green; unit 2564/2564)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 5 /qa: what the review and the audits changed
- **Stage:** validation
- **Context the AI had:** the slice-5 diff (a637b2c..df1a931), `build/plan-slice-5.md`, `spec.md`,
  `security.md`; one fresh code reviewer (Opus), `security-auditor`, a narrow `llm-security-auditor`
- **AI found:**
  - review (Important) — the last run's per-payment failures were computed but never shown, though M2
    relies on the panel for them; Retry always said "Retried." even when nothing changed; Run job now
    did not refresh the panel → all fixed;
  - audit (Low) — Retry ran outside the run lock (Stripe idempotency held, but a race could leave the
    DB out of step with Stripe) → retries take the lock; alerts went to anonymised admins and the
    day-3 notice to anonymised students → filtered; the watchdog loop had no bound → capped;
  - review (Minor) — the stale rule written twice, constants imported from services, no warning when
    no admin exists, a test that would pass without its filter → fixed; three more recorded as
    accepted in `security.md`;
  - C15, C16 (extended), C17, C23 implemented; LLM audit — nothing
- **How I verified:** *Not verified by me* (each fix: a test that failed first, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 6 plan: ten decisions the spec did not make (G1–G10)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-P19a, AC-L1–L4, L7, L9–L11; `security.md` AI-C1–C4, C7,
  AI-L9–L11; codebase anchors from one `feature-dev:code-explorer` pass
- **AI found while planning:** the enrollment predicate exists in five copies; the tutor eval stubs
  every DB tool, so an LLM-graded eval row cannot exercise the retrieval gate (AC-L2 asks for one)
- **AI proposed:**
  - G1 — one fragment `lessonOpenedBy(studentId)` used by every gated reader;
  - G2 — the tutor refuses an unopened lesson with a plain `403 "Lesson not opened"` before the guard
    and any model call; G3 — a `lesson_not_opened` event (layer `content_gate`), not sent to Sentry;
  - G4 — the study guide returns `null` to a student who has not opened the lesson; G5 — quiz get and
    submit throw `FORBIDDEN "Open the lesson first"`;
  - G6 — `search_across_course` keeps its schema, the student id comes from the closure;
  - G7 — AC-L2 proven by a deterministic canary integration test over the real tool and SQL instead
    of an eval row (**deviation from the spec**);
  - G8 — the AI-C2 usefulness count deferred; G9 — eval category `refund-terms`, reported, not gated;
  - G10 — existing tests that read content as a student seed an opened lesson
- **How I verified:** *Not verified by me* — I read the table and approved G1–G10, the G7 deviation
  explicitly
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why a deterministic test is stronger proof for AC-L2 than an
  eval row (G7), and why the refusal event does not go to Sentry (G3)*

### 2026-11-22 — Slice 6 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-6.md`, executed task by task with TDD
- **AI found while implementing:**
  - the tutor route's opened check is a nested select inside the existing authorizing query (one
    statement), so an unopened lesson (403) stays distinct from a missing one (404);
  - the course-search tool is registered as `scoped-by-caller`, not `opened`: its gate is the
    repository SQL (checked by the `definition` entry) and its signature requires the student;
  - break-it checks: without the `opened_lessons` join the canary test returns the unopened lessons;
    an unregistered reader fails `contentReaders`; a tutor tool importing opened-lesson state fails
    `refundIsolation`;
  - re-recording the tutor baseline moved quoted judge figures in five documents (low-confidence 4.0,
    hallucination-bait 4.0, missing-info relevance 1.7); they were reconciled to 2026-11-22
- **Eval result (one run, 58 rows × 3, gpt-4o-mini, $0.16):** `refund-terms` 12/12 (100%) — none of
  the excluded phrasings appeared (14/30 days, 3 lessons; widened at `/qa`, see below); every gated category 100%; `off-topic` 6/12 (7/12
  before; ungated, the same two rows fail every sample)
- **How I verified:** *Not verified by me* (each task's test ran red, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 6 /qa: what the review and the audit changed
- **Stage:** validation
- **Context the AI had:** the slice-6 diff (4b0a749..3b60dad), `build/plan-slice-6.md`, `spec.md`,
  `security.md`; one fresh code reviewer (Opus) and one `llm-security-auditor` (the slice changed
  controls but added no route, procedure or model, so one auditor)
- **AI found:**
  - review (Important) — the study guide's cancelled-enrollment test passed because the lesson was
    unopened, not because of the cancellation → both denial tests now seed an open; the quiz copied
    the route's inline `openedBy` select instead of a shared fragment → `lessonOpenedSelect` in
    `contentGate.ts`, used by both;
  - review (Important) + audit (Medium M-1) — the reader detector missed full-row reads and lessons
    loaded through a relation (two instructor readers were already unlisted), and checked the gate
    anywhere in the file → a balanced-brace detector over `server`, `app`, `lib`, a planted-fixture
    self-test, and the gate checked inside the function each entry names; break-it: removing the gate
    from `getForLesson` (left green before) and unlisting `course.service` both go red;
  - audit (Low L-1) — the search tool still told the model it searched "all lessons", so an empty
    result read as "the course does not cover it" → description and empty-result text name opened
    lessons; one eval run after: every count unchanged, `refund-terms` 12/12 with widened exclusions
    (weeks, 7/60 days, "3 opened lessons", "half the lessons");
  - audit (Low L-2 part, L-3, I-1, I-2) and three review minors → recorded as accepted in
    `security.md`;
  - every slice-6 control implemented; AI-C1…C4, C7, L9–L11 confirmed by the audit
- **AI proposed:** ADR-038 — the content gate changes what an enrollment grants, and every future
  reader must carry it (three-month test)
- **How I verified:** *Not verified by me* (each fix: a test that failed first, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — whether ADR-038 is worth a separate ADR or belongs in
  ADR-037*

### 2026-11-22 — Slice 7 plan: thirteen decisions the spec did not make (U1–U13)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-S1–S12, S19–S21, FR-P21, User flow → Student; `security.md`
  C1, C22–C24 and the slice-1 accepted items; codebase anchors from one `feature-dev:code-explorer` pass
- **AI found while planning:** no student read of a refund existed; the Purchases rows carried no
  `paidAt`, dispute or request state; `/pricing`, the course card and the purchase dialog still promise
  "30-day money-back"; only one of the seven student emails existed
- **AI proposed:**
  - U1 — two pure state functions (row, page) decide everything; the UI switches on `kind`;
  - U2/U3 — precedence: the request's status first; the row never counts lessons or the account limit;
  - U4 — the over-limit page names the condition and numbers, with no appeal button until slice 8;
  - U5/U6 — `refund.getForPayment`, the same NOT_FOUND for flag off / not yours; a DTO with no Stripe text;
  - U7 — the list carries the row state with two batched reads; U8 — local form state, re-read after submit;
  - U9 — close the slice-1 limiter item now (the page gives the endpoint a button);
  - U10 — "refund done" once behind the refund CAS, "denied" once after commit; strict payloads;
  - U11 — `/pricing` and the course page change with the flag; U12 — plain-text rendering + contract test;
  - U13 — split `BillingHistoryList` per the conventions
- **How I verified:** *Not verified by me* — I read the table and approved U1–U13 as proposed
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why the over-limit page ships without the appeal button (U4),
  and why the limiter was pulled forward (U9)*

### 2026-11-22 — Slice 7 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-7.md`, executed task by task with TDD
- **AI found while implementing:**
  - a payment refunded on the Dashboard (no request) needed its own page state, `payment_refunded`;
  - the read returns the course title with the state, for the page header;
  - "no N+1" is proven by a fixed count of repository reads for 1 and 5 purchases — the test and app
    database clients are separate, so a SQL query counter would miss the app's queries;
  - `sendOnce` moved to `server/services/email/` and is shared with the payout alerts;
  - condition, reason and policy texts live in pure `server/entities/refund/` modules, used by the
    client components and the emails alike;
  - the flag reaches the client course card and purchase dialog through a display-only context in
    the root layout, instead of a prop threaded through four components;
  - break-it checks: dropping `studentId` from the read's `where`, removing the limiter call, and adding
    `dangerouslySetInnerHTML` under Billing each turn a test red
- **How I verified:** *Not verified by me* (each task's test ran red, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 7 /qa: what the review and the audit changed
- **Stage:** validation
- **Context the AI had:** the slice-7 diff (975c801..a2f2b1c), `build/plan-slice-7.md`, `spec.md`,
  `security.md`; one fresh code reviewer (Opus) and `security-auditor` (no AI surface, so no LLM audit)
- **AI found:**
  - review (Important) — the row's status was a plain badge, so the refund page (denied conditions,
    FR-S20 text) was unreachable though the denial email points there → the status is a link to the
    details ("Refund details" for a refunded row, so "Refunded" no longer shows twice);
  - review (Important) — a failed `refund.done` / `refund.denied` send was never retried (each is sent
    once) → the daily payout watchdog re-sends any refund outcome of the last 7 days with no log row;
  - review (Important) — the deadline and the policy link sat in a hover tooltip, unreachable by
    keyboard and touch → visible text next to the action;
  - review (Important) + audit (I-2) — `/pricing` was prerendered with the build-time flag →
    `force-dynamic`, pinned by a contract test, and a Release-checklist note;
  - audit (Low L-1) — a malformed id in the refund URL showed the error page → a plain 404;
  - every slice-7 control implemented (C1, C2, C22 student half, C23, C24; the slice-1 lock-wait item
    closed); audit I-1, I-3 and review minors recorded
- **How I verified:** *Not verified by me* (each fix: a test that failed first, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 8 plan: eighteen decisions the spec did not make (V1–V18)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-S13–S18, FR-A1–A7, the notification matrix, the counting terms;
  `security.md` C11, C17, C18, C20–C22; codebase anchors from one `feature-dev:code-explorer` pass
- **AI found while planning:** `refund_requests` is one row per payment, so an appeal cannot be a
  second request; counting read `decision = 'auto_approved'`, which could not tell an appeal approval
  from an automatic one; there was no audit table, no private file store and no needs-review flag
- **AI proposed:**
  - V1/V2 — the request row stays the anchor (a direct appeal creates it as `direct_appeal`); an
    `approval` column (automatic / appeal / overdue) decides counting: D3 counts any approval, the
    account limit only automatic ones; an exception creates no row and counts for neither;
  - V3/V4 — `refund_appeals` (one per payment) and an append-only `refund_audit` with a trigger;
  - V5–V7 — a private Blob store, files checked by magic bytes, an authorizing download route;
  - V8/V9 — appeal text and files in one multipart request; direct appeal only from `over_limit`;
  - V10 — an open appeal holds the instructor's share;
  - V11/V12 — day-14 overdue approval in the payout job; reminders on days 10, 13, then daily;
  - V13/V14 — approve refused with a certificate or a dispute; the exception refund under the run
    lock, refused while an appeal is open;
  - V15/V16 — "needs review" on Dashboard refunds; the remaining emails;
  - V17/V18 — the student and admin pages
- **How I verified:** *Not verified by me* — I read the table and approved V1–V18 as proposed
- **Verdict:** `accepted`
- **Why:** *TODO (me): in my own words — why an appeal approval counts for D3 but not for the account
  limit (V2), and why a direct appeal is never approved on time alone (V11)*

### 2026-11-22 — Slice 8 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-8.md`, executed task by task with TDD
- **AI found while implementing:**
  - the request, the refund page and the appeal each gathered the same facts; one `gatherRefundFacts`
    now serves all three (and the purchases list reuses the shared dispute check);
  - Stripe's webhook for an admin exception can arrive before the exception applies its effects, and
    was then filed as a Dashboard refund — so the exception writes its audit row before the Stripe
    call, and the webhook reads it to keep the `admin_exception` path;
  - the payout lock moved to its own module (the job now calls the appeal service, which the
    exception also lives in — otherwise an import cycle);
  - an appeal or overdue approval is announced by the appeal-decided email, so the "refund done" email
    stays for automatic approvals only;
  - the admin and student notices share two email layouts under separate template keys;
  - break-it checks: dropping the audit trigger, the ownership filter of the download route, and the
    limiter each turn a test red
- **How I verified:** *Not verified by me* (each task's test ran red, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 8 /qa: what the review and the audit changed
- **Stage:** validation
- **Context the AI had:** the slice-8 diff (41140d5..82c3919), `build/plan-slice-8.md`, `spec.md`,
  `security.md`; one fresh code reviewer (Opus) and `security-auditor` (no AI surface)
- **AI found:**
  - audit (High H-1, blocking C11) + review (I4) — an appeal after a late denial was filed under its
    first failed condition, always `window`, so a student over the threshold or the account limit got
    an automatic approval on day 14 by asking after day 14 → the rule reads every failed condition and
    the label prefers threshold / account limit;
  - audit (Medium M-1) + review (Critical) — the day-14 approval skipped the certificate and dispute
    re-check the spec requires (EC-10) → re-checked inside the transaction; a blocked appeal stays open;
  - review (Important) — the day-3 reminders counted from the original filing, not the approval
    → `approved_at`; an appeal stayed open after a Dashboard refund, a lost dispute or an exception
    → closed as `closed_refunded`, never counted; the page showed "not approved" and an appeal form
    after such a refund → shows refunded; "days left" counted to the filing deadline → to day 14;
    the forms got stuck on a network error → recover;
  - audit (Low L-1, L-3, I-3) → fixed; L-2, I-1, I-2, I-4, I-5 → recorded as accepted in `security.md`;
    I-8 (should `earlier_refund` never be approved on time alone?) → an open question for me
- **How I verified:** *Not verified by me* (each fix: a test that failed first, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)* — I-8 decided 2026-11-22: `earlier_refund` is never approved on time alone (a
  second refund of a course always needs an admin)

### 2026-11-22 — Slice 9 plan: thirteen decisions the spec did not make (W1–W13)
- **Stage:** plan
- **Context the AI had:** `spec.md` FR-I1–I3, FR-P16, P17, P22, P23, P27, P28, FR-S22–S23 and their
  edge cases; `security.md` C19, C29; codebase anchors from one `feature-dev:code-explorer` pass
- **AI found while planning:** no Stripe fee, double-charge or bank-failure handling existed; a partial
  Dashboard refund lived only in an admin email; the instructor saw one "Pending" amount; refund text
  survived account deletion
- **AI proposed:**
  - W1 — one additive migration (fee, refunded amount, bank failure, enum values);
  - W2 — the fee from the balance transaction, never failing the checkout, filled by the daily job;
  - W3 — record partial refunds; show the remainder everywhere;
  - W4 — a per-(student, course) lock; the later paid checkout is refunded at once, counts for nothing;
  - W5/W6 — a failed bank refund restores access and holds the share; the admin closes it with one of
    two audited outcomes;
  - W7/W8 — the instructor's two held amounts from the release predicate; a C19 contract test;
  - W9 — the repurchase warning by the counting definition; no repurchase during an open dispute;
  - W10 — evidence deleted 30 days after the decision; W11/W12 — account deletion erases refund text
    and files and warns about an open appeal; W13 — AC-F27 and AC-F29 proven, not changed
- **How I verified:** *Not verified by me* — I read the table and approved W1–W13 as proposed
- **Verdict:** `accepted`
- **Why:** *TODO (me)*

### 2026-11-22 — Slice 9 implementation: where the code disagreed with the plan
- **Stage:** implementation
- **Context the AI had:** `build/plan-slice-9.md`, executed task by task with TDD
- **AI found while implementing:**
  - only partial Dashboard refunds are recorded, so `amount − refunded` stays the remainder after a
    later full refund too;
  - the checkout claim moved into the repository (one transaction, the split written with the status);
    the concurrency test passes even without the lock — the test pool serialises — so the lock is
    proven by reasoning, not by that test;
  - the reactivation of a cancelled enrollment is shared by a repurchase and a failed bank refund;
  - the purchase dialog asks for the repurchase warning itself instead of a prop threaded through four
    components; the "Waiting for Stripe" amount excludes a share due in the next run (counted on hold);
  - appeal status types now come from the Prisma enum, so a new value cannot drift;
  - break-it: a refund-appeal reference in an instructor component turns the C19 contract red
- **How I verified:** *Not verified by me* (each task's test ran red, then green)
- **Verdict:** `accepted`
- **Why:** *TODO (me)*


### 2026-11-23 — Slice 9 /qa: what the review and the audit changed
- **Stage:** validation
- **Context the AI had:** the slice-9 diff (586a907..f01057f), `build/plan-slice-9.md`, `spec.md`,
  `security.md`; one fresh code reviewer (Opus) and `security-auditor` (no AI surface, so no
  `llm-security-auditor`)
- **AI found:**
  - review #1 (Critical) = audit F3c — "the sale stands" after a student's request left the share held
    forever and the refund counting, because the request kept `approval`; the tests built only a
    Dashboard refund;
  - audit F3a/b — "the sale stands" forced the share to `pending`: a double charge would pay the
    instructor twice, a reversed share would be recorded as paid;
  - audit F1 = review #2/#3 — a double charge was marked only after its refund: a crash left it
    un-refunded with no flag, its own webhook filed it as a Dashboard refund, a failed refund was
    flagged silently;
  - audit F2 — the restore after a bank failure ran outside the transaction that recorded it, so one
    failed write lost the student's access for good; F5 — a redelivered event reopened a closed case;
    F6 — the partial-refund total could go backwards;
  - review #4 = audit F4 — "refunded another way" left the student with the money and the course
    (FR-P27 silent); review #5 — the refund page said "Refunded" while the email said it failed;
    minor #6–#13
- **AI proposed:** for each, a fix and a test; four decisions put to me as questions
- **My decisions:** all four as the AI recommended — (1) "the sale stands" reverses the request: a new
  `reversed` state, skipped by release and counting; (2) "refunded another way" removes access again;
  (3) "the sale stands" refused for a double charge, a transferred or reversed share never changed;
  (4) fix every finding with a test, nothing left only as accepted risk except three informational ones
- **How I verified:** *Not verified by me* — the AI ran each test red by removing its fix (break-it),
  then the full suite green
- **Verdict:** `accepted`
- **Why:** *TODO (me)*
