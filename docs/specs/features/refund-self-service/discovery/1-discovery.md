# Refund — Discovery

← [Spec](../spec.md)

## 1. Problem

**Problem statement.** A student for whom a paid course did not work out cannot get the refund the
site promises, because Learnix has no way to ask for one, and an admin can only refund manually in
Stripe. As a result, the promise on `/pricing` cannot be kept, and every refund is manual work with
no check of the conditions, which on top of that leaves two financial holes (Q7, Q8).

*The main problem is (a): there is no channel, so the promise cannot be kept.* Manual handling (b) is
its consequence. The Q7/Q8 holes (c) are a related problem: they already exist today, independent of
the channel, but the new feature will increase the number of refunds and so must close them (scope,
see Q21).

**What Refund is.** Returning money to a student for a paid course that did not work out for them:
too easy, too hard, or empty.

**Parties.** The student wants their money back. The admin (platform) returns the money. The
instructor loses their share of the sale.

**How it works now.** Money can only be returned manually through the Stripe Dashboard, and the
admin does it. The site promises the student 30 days for a refund ("contact us for a full refund"),
but there is nowhere to reach out: the `/contact` link in the footer leads to a page that does not
exist. So the student does not know how to get their money back and has no channel to ask.

**The problem for the instructor and the platform.** Every refund means lost revenue. On top of
that, there is a risk of abuse: a student completes the course, gets a certificate, and gets a
refund. The system currently allows this, because the certificate stays with the student after the
refund (Q7). If the instructor's money has not been transferred yet, the refunded sale will still be
paid out to them later (Q8).

**If we do nothing.** The promise on the site stays unkeepable, the student cannot get a refund on
their own, the platform handles every refund manually, and the two holes found (Q7, Q8) keep costing
the platform money.

**Why now.** The site already publicly promises a 30-day refund today, and it cannot be kept. There
is a purchase mechanism but no refund mechanism: that is a hole in the payment flow. In addition, the
IDP needs a feature with real ambiguities.

**Business expectation.** Students will buy more often, because they will not fear spending money on
a course that does not suit them. *This is an assumption (Q11), not a fact.*

### Value by party

| Party | Need | What they get | What they lose / risk |
|---|---|---|---|
| Student | Get money back for a course that did not work out | A clear way to request a refund from the course page and a visible request status | The conditions become stricter than the old unconditional promise (Q12, Q15) |
| Platform (admin) | Keep the promise without manually investigating every case | A queue of refund requests where progress and certificate are already visible; the Q7/Q8 holes closed | Admin time for review (Q19); the Stripe fee is not returned (Q17) |
| Instructor | Get a fair share of sales and understand where revenue comes from | A refund does not arrive as an unexpected reversal after a payout | Money arrives later, by the whole refund window (Q18); needs not researched (Q23) |

The value for the platform is partly verifiable already (the Q7/Q8 holes are confirmed by the code).
The value for the student and the effect on sales (Q11) are assumptions, because there are no real
users.

## 2. Discovery

### 2a. My questions (recorded 2026-11-04, before asking the AI)

**Business process**
- Who decides on a refund? *(= Q10)*
- How much time is allotted for the refund (execution)?
- How much time is allotted for the refund request?
- Will the ability to request be tied to course progress?
- Partial or full refund?

**Operation state / money**
- When is a refund allowed? *(≈ Q12)*
- If a refund failed, can it be retried?
- If there is no money on the balance, where does the refund come from?
- Money goes to the instructor after passing KYC, how do we refund then?
- Do we need to hold the money for the refund window?

**Integrations:** I did not write down any questions.
**Frontend / UX:** I did not write down any questions.

*Added 2026-11-08, after the AI (2b). I do not present these as my questions from 2a.* What is
already known from the code about integrations:
- The provider is Stripe; the Connect model is **separate charges and transfers**: the payment goes
  to the platform balance, then `transfers.create` with `source_transaction`
  (`connect.service.ts:153-157`).
- Instructor accounts are Express, created via the legacy `type: "express"` (`connect.service.ts:21`).
- The system learns the refund result only from the `charge.refunded` webhook (Q4); there is no own
  `refunds.create` call in the code.
- The reversal goes with `refund_application_fee: false` (`connect.service.ts:202-203`).

The Integrations and UX questions that remained open (idempotency, webhook did not arrive, UI states,
what the student sees on an error) are edge cases and failure scenarios; I work through them in
Analysis.

### 2b. Questions from the AI

The AI's verbatim answer: [`raw/discovery-questions.md`](raw/discovery-questions.md)
(~60 questions in 6 categories + 10 scenarios + top 5).

### 2c. Comparison and sorting

**My questions (2a) vs. the AI (2b).** The AI mentor helped match the numbers; the conclusions are
mine.

| My question | In AI | Result |
|---|---|---|
| Who decides on a refund? | B1, top-1 | Both → Q10 |
| How much time to execute the refund? | E5 (partially) | Both, weaker in AI |
| How much time for the request? | Top-5, edge "from what moment the 30 days run" | Both → Q14 |
| Tie the request to progress? | B2, top-2 | Both → Q12, Q13 |
| Partial or full? | P2 | Both → Q16 |
| When is a refund allowed? | B2 | Both → Q12 |
| Refund failed, retry? | E1, E2 | Both |
| No money on the balance, from where? | P1, B4 | Both → Q9, Q17 |
| Money after KYC, how to refund? | P3, S7 | Both → Q8 |
| **Hold the money for the window?** | **none** | **Only me** → Q18 ([AI log](../journal/ai-decision-log.md)) |

**What the AI found and I missed:** the User Flow (U1–U7) and Error Handling (E1–E5) areas are empty
in my list. All these questions concern the task, so they go to the Analysis stage (edge cases,
failure scenarios). Honest conclusion: I thought about money and rules, but not about what the
student sees and what breaks.

**What to check in Analysis before accepting:** payment currency, subscriptions and bundles,
re-authentication (SE5). This may be unnecessary for Learnix.

**An ambiguity the AI correctly found (section 4, #2):** is the goal self-service, or is a working
contact channel enough? Resolved by decision Q21.

**The AI's top-5 questions**, which I answered as PO, → Q10, Q12–Q19.

## Questions

| # | Question | Answer | Status | Source |
|---|---|---|---|---|
| Q1 | Why does a student want a refund? | The course is too easy, too hard, or empty | Assumption | My understanding as PO; there are no real users. Check: reasons in requests after launch |
| Q2 | What does the site promise about refunds? | A 30-day guarantee, "contact us for a full refund" | Confirmed | `app/(marketing)/pricing/page.tsx:83-85` |
| Q3 | Is there a contact channel? | No: the footer links to `/contact`, the page does not exist | Confirmed | `app/_components/Footer/index.tsx:77`; there is no `contact` in `app/(marketing)/` |
| Q4 | How does a refund happen now? | The admin manually in the Stripe Dashboard. The system only reacts to the `charge.refunded` webhook: payment → `refunded`, enrollment → `cancelled`, reversal of the transfer if it already happened | Confirmed | `app/api/stripe/webhook/route.ts:55-62`; `server/services/payments/payment.service.ts:167-195` |
| Q5 | When does the instructor get the money? | Right after payment, if they have Stripe connected with `payouts_enabled`. Otherwise `pending`, and the money goes later via `sweepPendingTransfers` | Confirmed | `server/services/payments/connect.service.ts:118-165` |
| Q6 | Do we need to ask the instructor to return the money? | No, the system automatically takes back the share of already transferred money via `transfers.createReversal` | Confirmed | `payment.service.ts:192-194`; `connect.service.ts:195-207` |
| Q7 | Does the student keep the certificate after a refund? | Yes. A refund changes `enrollment.status`, while the certificate depends only on `completedAt`, which is not cleared | Confirmed (by reading the code) | `certificates/certificate.service.ts:15`; `enrollment.repository.ts:97-100` |
| Q8 | What happens on a refund if the transfer is still `pending`? | **Bug:** `handleRefund` does nothing for `pending`, and the sweep takes all `pending` without checking for a refund, so the instructor is paid for a refunded sale **Decision 2026-11-08:** cancel the transfer on refund + a double check before payout (locally and in Stripe) + an atomic state transition ([Analysis C2](2-analysis.md)) | Confirmed (by reading the code; a test is needed) | `payment.service.ts:192`; `connect.service.ts:168-170` |
| Q9 | What happens to the reversal if the instructor has already withdrawn the money from Stripe? | Depends on who is responsible for the account's negative balance (`controller.losses.payments`). If the platform (`application`), the reversal drives the instructor's balance negative, Stripe covers it from the platform balance, and if that is not enough, debits the platform's bank account. If Stripe, the reversal may fail and has to be retried when funds appear. **For Learnix the platform is responsible (Q25, checked in the account).** Conclusion: if the instructor has already withdrawn the money, the reversal goes through and the platform covers the loss. Q18 closes the risk only within the window: a dispute/chargeback through the bank can arrive even after the window closes, when the instructor has already received the money → edge case for Analysis | Confirmed: mechanics — Stripe documentation (AI research, re-read 2026-11-08); for Learnix — Q25 | [Risk and liability with Connect](https://docs.stripe.com/connect/risk-management); [Refunds and disputes](https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes) |
| Q10 | Who should decide on a refund: the admin, the instructor, or a rule? | **The student submits a refund request, the admin approves.** Not automatic: every refund is a loss for the platform and the instructor, a mediator is needed. Not the instructor: conflict of interest, because they decide whether to give back money already received. *Open:* why not automation with the Q12 rules (it also blocks abuse)? Trade-off: the admin does not scale | Decision (PO), preliminary; revisit at Alternatives | My decision, 2026-11-04 |
| Q11 | Will a refund guarantee increase the number of purchases? | I expect so | Assumption | No data. Check: conversion before/after launch |
| Q12 | Under what conditions is a refund fair, and when is it abuse? | Three conditions: (1) within the window (Q14); (2) progress below the threshold (Q13); (3) certificate not received, otherwise a refund is impossible | Decision (PO) | My decision, 2026-11-04 |
| Q13 | What is the progress threshold? Count by lessons or by duration? | Not defined. **Plan:** decide at Alternatives/Decision. Criteria: (1) what the system can already count (*corrected 2026-11-08:* not `CourseProgress` — it is dead, but `LessonProgress` + the `Enrollment.progress` cache; see [Analysis A2](2-analysis.md)). **The unit is decided: number of lessons** (A2); the threshold itself is Open; (2) whether the threshold can be bypassed (short lessons, skipping through video); (3) how the threshold relates to the certificate requirement; (4) market references (Udemy, Coursera) — only as a guide, not as proof | Open, plan exists | Justification (evidence) needed |
| Q14 | What is the length of the refund window? | Counted from the moment of payment. The length is not defined: the site promises 30 days, but with the new conditions it may change. **Plan:** decide together with Q13 and Q18, because window length = payout delay for the instructor. Criteria: the old promise (30), the delay for the instructor, Stripe limits on refunding an old payment | Decision (PO) on the starting point; Open on the length, plan exists | My decision; `pricing/page.tsx:85` |
| Q15 | What about those who bought under the old promise "full refund, 30 days"? | The new rules apply to old purchases too. *Risk:* the promise was unconditional (trust; for the legal side see Q24) | Decision (PO), risk accepted | My decision, 2026-11-04 |
| Q16 | Full or partial refund? | Full only, partial is not available | Decision (PO) | My decision, 2026-11-04 |
| Q17 | Who bears the losses and the Stripe fee? | The refund comes from the platform balance, the platform covers the Stripe fee. **Documentation:** Stripe does not return the processing fee of the original payment; the card refund itself is free on the standard pricing. **Code:** the student pays exactly the course price, no surcharge; the 20/80 split is computed from the full price, the Stripe fee is not accounted for in it, so it comes entirely out of the platform's share. **Example $50:** after the fee (~$1.75, US pricing; the exact rate depends on the account) and the $40 transfer, the platform is left with $8.25 instead of $10; on a refund the platform gives back $50, takes $40 back via reversal → −$1.75. Every refund is a direct loss for the platform only. **Alternative (not considered):** share the Stripe fee proportionally with the instructor, then both would bear the loss on a refund. Accept or reject — a PO decision | Facts Confirmed (documentation + code; AI research, re-read 2026-11-08). Decision (PO) on who bears the fee — Open: the alternative is not yet evaluated. *Closed by A8 (`3-alternatives.md`), 2026-11-21* | My decision; [Understanding fees for refunded payments](https://support.stripe.com/questions/understanding-fees-for-refunded-payments); [Refunds](https://docs.stripe.com/refunds); `lib/platformFee.ts`; `payment.service.ts:82-92, 149-157`; `connect.service.ts:154` |
| Q18 | Should the instructor's share be held for the window? | Yes: money goes to the instructor only after the window closes, so the immediate-transfer logic will change. Removes the Q8 and Q9 risks. **Argument (Q9 + Q25, checked):** now, if the instructor managed to withdraw the money and the student got a refund, the reversal drives their balance negative, and Stripe covers the negative from the platform balance, because `losses.payments: "application"`. That is, the platform bears the whole loss. The hold makes it so that at the moment of any refund within the window the money is still on the platform balance: no reversal is needed and there is no negative balance. Outside the window the risk remains via dispute/chargeback (Q9). Cost: the instructor gets the money later. Money = complex tier, an ADR is needed. **Clarified 2026-11-08:** hold until the window closes **or** until the decision on a refund request submitted within the window ([Analysis C1](2-analysis.md)) | Decision (PO), preliminary; technical part at Alternatives | My decision; my question from 2a |
| Q19 | The student reached the certificate while the refund request was waiting for review | The admin evaluates progress at the moment of the decision; if the certificate has been received, the request is rejected. Consequence: the admin's review speed becomes a requirement. *Checked 2026-11-08:* freezing the course for the duration of the review was considered and rejected ([Analysis S6](2-analysis.md)) — the decision stands | Decision (PO) | My decision, 2026-11-04 (edge case from the review) |
| Q20 | What to do with the guarantee text on `/pricing`? | It must be changed to fit the new conditions and window length | Open (consequence of decisions Q12, Q14) | `pricing/page.tsx:83-85` |
| Q21 | Scope: only a working contact channel (`/contact`, email) or a refund request in Learnix? | **A refund request in Learnix**: the student submits it from the course page, the admin sees a queue with progress and certificate, the student sees the status. Why: the admin must see progress, and all three Q12 conditions are data the system already has; manual checking by email is slow and error-prone (see Q19). Rejected: only a contact channel (less work, but the admin checks everything manually). Independently of this, Q18, Q7, Q8 are in scope | Decision (PO) | My decision, 2026-11-04; ambiguity #2 from the AI |
| Q22 | What does the student see on the invoice after a refund? | An invoice is issued for `refunded` payments too (`billing.listPurchases`), and it shows the status. Is a separate document (credit note) or a "refunded" mark needed? | Open | `docs/specs/features/billing/spec.md`; `app/_components/Invoice/` |
| Q23 | What changes for the instructor? | The `refunded` status already exists on the Revenue screen (`Instructor/Revenue/constants/statusClass.ts`). Unknown: whether to notify the instructor about a refund request/refund; how to show money held for the window (Q18) — a new "on hold" status? Do they see the refund reason (Q1)? | Open | Revenue code; consequence of Q18 |
| Q24 | Are there legal limits on changing the refund conditions? | Unknown. Consumer rights to a refund for digital content depend on the country; changing an unconditional promise retroactively (Q15) may be risky | Constraint, out of scope for a pet project | In a real product — a question for a lawyer before launch |
| Q25 | Who is responsible for the negative balance of instructor accounts? | **The platform.** `controller.losses.payments: "application"` (`type: "express"`, `controller.type: "application"`). In addition, `controller.fees.payer: "application_express"`: Stripe fees for Express accounts (active account, payouts) are also paid by the platform | Confirmed (`stripe get /v1/accounts/acct_1Tiqo72LF0Z96Erz`, sandbox, 2026-11-08) | Closes Q9 |

**Out-of-scope observation.** `platformFeesCents` in the revenue stats
(`payment.service.ts:231`) shows 20% of sales without accounting for the Stripe fee, so the
platform's real revenue is lower than shown. It does not affect Refund; a separate task.

## Ambiguities

What can still be understood in two ways. Each item has the stage at which I close it.

| # | Ambiguity | Interpretations | Where I close it |
|---|---|---|---|
| A1 | Who makes the refund decision (Q10) | Admin manually · automation by the Q12 rules · automation + admin only for disputed cases | Alternatives |
| A2 | What "progress" means for the threshold (Q13) | Share of completed lessons · share of duration · watched videos | **Closed 2026-11-08:** share of completed lessons ([Analysis A2](2-analysis.md)) |
| A3 | Window length (Q14) | Keep 30 days · shorter, because it now = the instructor's payout delay (Q18) | Decision, together with Q13/Q18 |
| A4 | What "refund" means in the product | Money only · money + closing access · money + access + revoking the certificate. Currently access is closed (`enrollment → cancelled`), the certificate stays (Q7); per Q12 a certificate blocks a refund, so there is nothing to revoke. Do certificates from refunds made manually through the Stripe Dashboard need to be revoked (S4 from the AI)? | **Closed 2026-11-08** with open sub-questions: [Analysis A4](2-analysis.md) (D1–D4) |
| A5 | Does the manual path through the Stripe Dashboard remain in parallel with refund requests | Yes, as an emergency path · no, only through Learnix. This determines whether a refund can appear without a request | **Closed 2026-11-08:** yes, as an emergency path; same consequences ([Analysis A5](2-analysis.md), E1–E4) |
| A6 | How to show held money to the instructor (Q18, Q23) | A separate status · the same `pending` · do not show until the window closes | Specification |
| A7 | What counts as an "old purchase" (Q15) | Paid before the feature launch · paid before the text on `/pricing` changed | Specification |
| A8 | Who bears the Stripe fee (Q17) | Platform only (as now) · platform and instructor proportionally | Alternatives |

## Rehearsal: what would have changed without Discovery

*The answer was recorded 2026-11-08 in three iterations with review by the AI mentor. The basis is my
wording; places corrected after the review are marked "(corrected)".*

**Question:** what concretely would have changed in the final Refund decision if we had skipped
Discovery and gone straight to writing the spec?

**Thesis.** Without Discovery we would have had insufficient information to choose an approach and
would have gone with what the AI proposed. Details and important factors affecting the decision
would have been missed.

**Example 1 — holding the instructor's money (Q18).** Without Discovery the money would have been
sent to the instructor immediately. Discovery showed that this creates a problem with refunds: if the
instructor has already withdrawn the money, the reversal drives their balance negative, and the
platform covers that negative from its own balance. The platform — because in our account it is the
one responsible for the negative balance: `losses.payments: "application"`, checked in the Stripe
account (Q25) *(corrected: the reason)*. If the money is held for the window, the instructor loses
only time: they wait instead of receiving it immediately. The limit of the decision: after the window
closes, the student can dispute the payment through the bank (dispute / chargeback), bypassing the
Learnix rules, while the instructor has already withdrawn the money — here the hold does not protect
*(corrected: not "will ask for a refund", because the Q12 rules forbid that)*. I raised this
question; the AI missed it (AI log, 2026-11-04).

**Example 2 — the Stripe fee (Q17).** Without Discovery it was unknown who pays the fee and what the
platform loses on a refund. The platform pays the fee when the course is bought, and Stripe does not
return it on a refund. For a $50 course: 2.9% + $0.30 ≈ **$1.75** lost on every refund (US pricing;
the exact rate depends on the account) *(corrected: was $1.25)*. This opened an alternative that did
not exist before: share the fee proportionally with the instructor (A8) *(added)*.

**Conclusion.** Discovery influenced the architectural decision: instead of an immediate transfer, a
refund window with a hold on the instructor's share, so the platform does not go negative. And this
decision was made on verified facts (code + Stripe account), not on the AI's proposal *(added)*.
