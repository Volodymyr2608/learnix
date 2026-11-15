---
feature: refund-self-service
status: planned
models: [Payment, Enrollment, RefundRequest, PayoutRun]
depends-on: [payments, billing, certificates]
---

## Description

A student who bought a paid course can ask for their money back from inside Learnix, within a fixed
window after paying. Fixed rules decide the request at once. The student may appeal a denial once,
and an admin decides the appeal. The instructor's share of every sale is held until the window
closes, so a refund never has to claw money back from the instructor.

## Problem statement

A student who paid for a course that turned out wrong for them (too easy, too hard, or thin on
content) cannot get the refund the site promises. `/pricing` promises a 30-day "contact us for a full
refund", but there is nowhere to ask. The footer's `/contact` link points at a page that does not
exist. The only way money goes back today is an admin refunding the charge by hand in the Stripe
Dashboard. Nothing checks whether the refund is fair, and nobody records why it happened.

The manual path also leaks money for the platform today, independent of how often it is used:
- a refunded student keeps their certificate;
- an instructor whose payout was still `pending` at refund time is paid for the refunded sale later;
- a refund after payout is clawed back from an instructor who may already have withdrawn the money.
  In that case the platform covers the negative balance.

**If nothing is done**, the site keeps a promise it cannot fulfil, every refund stays manual and
unchecked, and the leaks above keep costing the platform, more so as sales grow.

## Business / user value

| Party | Need | Gains | Gives up / risk |
|---|---|---|---|
| Student | Get money back for a course that did not suit them | A visible way to ask from the course itself, an immediate answer, one appeal, a status they can follow | Conditions are stricter than the old unconditional promise: a 14-day window, a lesson limit, no refund after a certificate |
| Platform (admin) | Honour the promise without investigating every case by hand | Most requests decided without an admin; only appeals reach the queue; the three leaks closed | Admin time on appeals; the Stripe fee on every refunded payment (not returned by Stripe) |
| Instructor | A fair share of sales, with no surprise clawbacks | A refund inside the window never touches money already paid to them | Payout arrives after the window (14 days, worst case ≈ 31 days with an appeal) instead of at sale |

**Where they pull against each other:**
- The window length is the student's time to judge the course and, at the same time, the
  instructor's wait for money (A3).
- An automatic decision is fast and consistent for the student but can wrongly deny an honest one;
  the appeal is the release valve, and it costs admin time (A1).

The platform-side value is verifiable now: all three leaks are confirmed in code. The student-side
value and any effect on sales are **assumptions**, because there are no real users (see
Assumptions).

## Discovery

Full trail in [`discovery/`](discovery/):
- [`discovery.md`](discovery/discovery.md): Q1–Q25, A1–A8;
- [`analysis.md`](discovery/analysis.md): A2/A4/A5, S1–S7, C1–C5;
- [`decisions.md`](discovery/decisions.md): the weighted alternatives behind every Decision below;
- [`ai-decision-log.md`](discovery/ai-decision-log.md): what an AI proposed and how it was checked;
- [`ai-raw/`](discovery/ai-raw/): what an AI without code access produced.

**AI** = an AI assistant proposed the finding. Each such row says how it was verified, or that it
was not.

| # | Question | Finding | Source |
|---|---|---|---|
| D-1 | What does the site promise? | 30-day guarantee, "contact us for a full refund" | `app/(marketing)/pricing/page.tsx:83-85` |
| D-2 | Is there a channel to ask? | No. The footer links `/contact`, and no such page exists | `app/_components/Footer/index.tsx:77` |
| D-3 | How does a refund happen today? | Admin refunds in the Stripe Dashboard. The `charge.refunded` webhook marks the payment `refunded`, cancels the enrollment, and reverses the transfer if it was `transferred`. Learnix never calls `refunds.create` | `app/api/stripe/webhook/route.ts:55-64`; `server/services/payments/payment.service.ts:167-195` |
| D-4 | Does the certificate survive a refund? | Yes. Certificate = `Enrollment.completedAt != null`, which a refund does not clear; the list and the PDF do not check status | `server/services/certificates/certificate.service.ts:15`; `server/repositories/enrollment.repository.ts:97-99` |
| D-5 | What if the transfer is still `pending` at refund? | **Bug:** `handleRefund` ignores `pending`; `sweepPendingTransfers` pays every `pending` row without checking `payment.status` | `payment.service.ts:192`; `connect.service.ts:167-193` |
| D-6 | Who covers a reversal if the instructor already withdrew? | The platform: `controller.losses.payments = "application"` | `stripe get /v1/accounts/…` (sandbox, 2026-11-08, verified by me); [Stripe: Connect risk](https://docs.stripe.com/connect/risk-management) |
| D-7 | Does Stripe return its fee on refund? | No. The original processing fee is kept, and the refund itself is free. The 20/80 split ignores the fee, so the platform bears all of it | [Stripe support](https://support.stripe.com/questions/understanding-fees-for-refunded-payments); `lib/platformFee.ts` (AI; docs re-read 2026-11-08) |
| D-8 | What counts as progress? | `LessonProgress.isCompleted`, set by the student pressing "Complete"; nothing checks viewing. `CourseProgress` is dead (0 rows, no writers) | `lesson.service.ts:176,215-221`; `prisma/schema/course.prisma:52` (AI; dev-DB query) |
| D-9 | Can "Complete"-based progress be gamed? | Yes. A student can read the whole course without pressing "Complete" and stay at 0% | Follows from D-8 (AI; not exercised) |
| D-10 | Is lesson opening recorded? | Only one date per course (`Enrollment.lastAccessedAt` via `touchLastAccessed`), not which lessons were opened | `lesson.service.ts:155`; `prisma/schema/enrollment.prisma:23` (AI) |
| D-11 | How do platforms decide refunds? | Short window + one objective rule + account-level limits + automatic by default; a human only on appeal. Udemy 30 days with "significant consumption"; Teachable 14 days; Coursera ~14 days (unverified) | [Udemy](https://support.udemy.com/hc/en-us/sections/206457407-Refunds); [Teachable](https://support.teachable.com/en/articles/16631486-custom-refund-policies) (AI research) |
| D-12 | What does a repurchase do? | Allowed (only `active`/`completed` block it). It reactivates the enrollment and clears `completedAt`, but keeps `LessonProgress` and `Enrollment.progress`, so the old progress "comes back" | `payment.service.ts:58-63`; `enrollment.service.ts:73-78` (AI) |
| D-13 | Can a Dashboard refund be prevented? | No. Anyone with Dashboard access can refund, and the webhook arrives regardless of source. A partial refund is treated as full; disputes are not handled | `route.ts:55-64` (AI) |
| D-14 | Is there a scheduler? | No: no `vercel.json`, no cron routes, no queue. The n8n cron (ADR-014) was switched off for cost | commit `b9c2f7d` (AI; verified in repo) |
| D-15 | Can Stripe hold the instructor's money for us? | No for our charge model. `delay_days` applies only to `on_behalf_of` or direct charges; a manual payout schedule still needs a trigger | [Stripe: payout schedule](https://docs.stripe.com/connect/manage-payout-schedule) (AI; docs read by me) |
| D-16 | What happens after a refund to access, messages, reviews, recommendations? | Access and new quiz attempts close. A student can still message the instructor in an existing thread. A review stays in the rating. The interest embedding is not recomputed | `lesson.service.ts:121-124`; `messaging.service.ts:119-151`; `courseReview.repository.ts:43`; `enrollment.service.ts:79` (AI) |
| D-17 | Is there a transfer idempotency guard? | No `idempotencyKey` anywhere: two concurrent sweeps transfer twice | `grep idempotencyKey` → 0 (AI) |

**What I found that the AI did not:** whether to hold the instructor's share during the window
(D-5/D-6 → ADR-037). **What the AI found that I did not:** user-flow and error-handling questions,
the transition period for purchases made before launch, the short-course threshold problem, and
dispute plus refund on the same payment.

## Ambiguities

| # | Ambiguity | Resolution |
|---|---|---|
| A1 | Who decides a refund: admin, rules, or both? | **Decided:** automatic rules; the admin sees appeals only (Decision §A1) |
| A2 | What "progress" means for the threshold | **Decided:** the number of lessons **opened**, not completed or watched time (Decision §Q13) |
| A3 | How long the window is | **Decided:** 14 days from payment (Decision §A3) |
| A4 | What a refund means in the product | **Decided:**
- money back;
- enrollment cancelled;
- certificate revoked where one exists (only reachable via the Dashboard or an admin exception);
- learning records cleared;
- messaging closed;
- recommendations recomputed. |
| A5 | Does the Dashboard path stay? | **Decided:** yes, as an emergency path, with the same consequences; it counts as the one refund |
| A6 | How the instructor sees held money | **Open, owner: this spec** (User flow, open question) |
| A7 | What an "old purchase" is | **Decided:** the rollout is staged (hold first, button 14 days later), so no purchase is refundable without being held (Decision §S2) |
| A8 | Who bears the Stripe fee | **Decided:** the platform, unchanged (Decision §A8) |
| A9 | Role of evidence against objective rules | **Decided:** rules filter automatically; evidence is used only on appeal |

## Assumptions

| # | Assumption | How to verify | If false |
|---|---|---|---|
| AS-1 | Students want refunds because a course is too easy, too hard, or thin | Reasons recorded on requests after launch | The reason list changes; the rules hold |
| AS-2 | A refund guarantee increases purchases | Conversion before and after launch | The feature still closes the leaks; marketing value drops |
| AS-3 | The first two lessons of a course are introduction and setup; the third is the first substantive one | Holds for all 7 dev-DB courses (**seed data**, not real courses) | The threshold of 3 is wrong; revisit Q13 |
| AS-4 | The admin has ~2.5 h/week and an appeal takes ~15 min | Measure appeal handling time | The "> 10 appeals/week" revisit trigger moves |
| AS-5 | Opening a lesson approximates consuming it | Not verifiable without viewing telemetry | Known limit: opened ≠ read, so the threshold is a deterrent, not proof |
| AS-6 | `losses.payments = "application"` on the production account as on sandbox | Check the live account before launch | The negative-balance reasoning changes; the hold is still needed |
| AS-7 | Vercel Hobby permits this commercial use | Read the terms (the page did not load) | Pro plan or another scheduler |

## Constraints

| Constraint | Source |
|---|---|
| Separate charges and transfers, platform is merchant of record, no `on_behalf_of` | ADR-019 |
| Payout hold, single release predicate, compare-and-set transfer states, daily cron, event replay | ADR-037 |
| Stripe keeps its processing fee on refund | [Stripe support](https://support.stripe.com/questions/understanding-fees-for-refunded-payments) |
| Stripe events are retrievable for 30 days; webhooks retry up to 3 days (live) | [Stripe: events](https://docs.stripe.com/api/events/list), [webhooks](https://docs.stripe.com/webhooks) |
| A chargeback is possible for up to 120 days regardless of our window | [Stripe](https://stripe.com/resources/more/chargeback-time-limits-in-the-uk) |
| Vercel Hobby cron runs once a day, ±59 min, 300 s per run, no retries | [Vercel cron docs](https://vercel.com/docs/cron-jobs) |
| Consumer-law limits on changing refund terms (EU 14-day withdrawal, digital-content exception) are out of scope for a pet project | Directive 2011/83 art. 16(m); Q24 |
| Full refunds only; no partial refunds | Q16 |
| Deadline: IDP review 2026-11-25 | IDP |

## User flow

_Next step: drafted after the open questions below are answered._

## Functional requirements

_Pending._

## Alternatives

_Pending: summary of A1, Q13, A3, A8, S2, D2, E2 plus link to ADR-037._

## Trade-offs

_Pending._

## Decision

_Pending._

## Acceptance criteria

_Pending: includes the security-auditor controls._

## Source of truth

_Pending._

## Agent notes

_Pending._
