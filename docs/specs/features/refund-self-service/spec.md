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
| A5 | Does the Dashboard path stay? | **Decided:** yes, as an emergency path, with the same consequences. It does **not** count as the student's one refund of the course (changed 2026-11-16, Decision §OQ-3) |
| A6 | How the instructor sees held money | **Decided:** two amounts, "on hold until the refund window closes" and "waiting for Stripe connection"; refund requests are not shown to the instructor (Decision §A6) |
| A7 | What an "old purchase" is | **Decided:** the rollout is staged (hold first, button 14 days later), so no purchase is refundable without being held (Decision §S2) |
| A8 | Who bears the Stripe fee | **Decided:** the platform, unchanged (Decision §A8) |
| A9 | Role of evidence against objective rules | **Decided:** rules filter automatically; evidence is used only on appeal |
| A10 | What a refund of one of two payments for the same course does | **Decided:** access is cancelled only when no other paid payment for the course remains; a duplicate payment is refunded automatically and does not count as the student's refund (Decision §DC) |

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
| AS-8 | Courses with purchases cannot be deleted (the separate feature in Unsupported use cases ships first or together) | Check before enabling the refund button | Deleting a course sets L = 0, so the threshold becomes 0 and buyers inside the window cannot even reach the button; the admin must refund them as exceptions (T27) |

## Constraints

| Constraint | Source |
|---|---|
| Separate charges and transfers, platform is merchant of record, no `on_behalf_of` | ADR-019 |
| Payout hold, single release predicate, compare-and-set transfer states, daily cron, event replay | ADR-037 (amended 2026-11-16) |
| A student may upload files only as refund-appeal evidence, through a private-blob handler | ADR-017 Rule 4 (amended 2026-11-16) |
| Stripe keeps its processing fee on refund | [Stripe support](https://support.stripe.com/questions/understanding-fees-for-refunded-payments) |
| Stripe events are retrievable for 30 days; webhooks retry up to 3 days (live) | [Stripe: events](https://docs.stripe.com/api/events/list), [webhooks](https://docs.stripe.com/webhooks) |
| A disputed charge cannot be refunded (`charge_disputed`, `refund_disputed_payment`). No age limit for refunding a card charge is documented; a refund draws on the available balance and fails after 45 days pending if it is insufficient | [Stripe: refunds](https://docs.stripe.com/refunds), [error codes](https://docs.stripe.com/error-codes) (read via `stripe docs` 2026-11-16) |
| A fully refunded payment cannot be disputed; a partially refunded one can, for the full amount. No refund outside the dispute process while a dispute is open | [Stripe: dispute best practices](https://docs.stripe.com/disputes/prevention/best-practices), [how disputes work](https://docs.stripe.com/disputes/how-disputes-work) (read via `stripe docs` 2026-11-16) |
| A chargeback is possible for up to 120 days regardless of our window | [Stripe](https://stripe.com/resources/more/chargeback-time-limits-in-the-uk) |
| Vercel Hobby cron runs once a day, ±59 min, 300 s per run, no retries | [Vercel cron docs](https://vercel.com/docs/cron-jobs) |
| Consumer-law limits on changing refund terms (EU 14-day withdrawal, digital-content exception) are out of scope for a pet project | Directive 2011/83 art. 16(m); Q24 |
| Full refunds only; no partial refunds | Q16 |
| Deadline: IDP review 2026-11-25 | IDP |

## User flow

*Draft 2026-11-16, written by AI from `discovery/decisions.md` at my request; under my review.
The open questions OQ-1–OQ-7 at the end of this section were all decided on 2026-11-16.*

### Student

**Precondition:** a paid course with a `succeeded` payment; the refund button is on (S2: the payout
hold ships first, the button 14 days later behind a flag).

**Main flow: refund approved automatically**

1. On the course page the student sees "Request a refund" and the deadline: payment date + 14 days,
   UTC (A3).
2. The form asks for a reason from a closed list (too easy, too hard, thin content, other) plus
   optional text. There are no files at this step (C4, S3). The form states the consequences: access
   closes, progress is erased, a course is refunded only once.
3. The system checks the conditions and stores a snapshot of them on the request (V6):
   - the request is inside the window, checked at submission (C1.1);
   - opened lessons ≤ `min(3, ⌊L/2⌋)`, where L is non-deleted lessons at submission (Q13);
   - no certificate (Q12);
   - no earlier refund of this course (D3);
   - fewer than 3 account-limit refunds (automatic refunds and lost disputes) in the last 12 months
     (OQ-2, DL).
4. All conditions hold, so the system refunds at once: `refunds.create` with an idempotency key,
   applied synchronously from the response (S7). Then:
   - payment becomes `refunded`, and the held transfer becomes `cancelled` (ADR-037);
   - enrollment becomes `cancelled`, but only if no other paid payment for the course remains (DC);
   - learning records are cleared (D2), messaging closes, recommendations are recomputed (A4).
5. The student sees "Refunded" with a note that the money reaches the card in about 5–10 business
   days, depending on the bank ([Stripe: refunds](https://docs.stripe.com/refunds)), and gets an email.

**Branch A: appeal (OQ-1, decided V3)**

- A1. The opened-lesson threshold or the account limit is already exceeded when the student opens
  the course page. Instead of "Request a refund" they see "Appeal to an admin", naming the condition
  (for example, "you opened 4 lessons; the limit for this course is 3"). There is no automatic denial
  step in this case.
- A1′. Automatic denial remains only for a condition that changed between page load and submit (for
  example, the window closed, or the instructor deleted lessons so L dropped). The request is saved
  as denied, naming the failed condition; the student gets an email and may appeal.
- A2. The student may appeal **once**. The appeal carries a reason and evidence files. Deadline:
  the end of the window for a direct appeal (A1); the later of window end or denial + 3 days after
  an automatic denial (A1′, C4).
- A3. The appeal goes to the admin queue. The money stays held. The student sees "Appeal under
  review, decision by <date>" (review ≤ 14 days). If the admin has not decided by then, an appeal
  that followed an automatic denial for a condition other than the opened-lesson threshold or the
  account limit is approved automatically and marked "overdue" in the audit (OQ-5). Any other appeal
  (a direct one, or one after a threshold or account-limit denial) is not: the admin keeps getting
  reminders (T11, amended 2026-11-21).
- A4. If the admin approves, step 4 follows. If the admin denies, a written reason is mandatory and
  files are optional (C5.2). The decision is final, and the student gets an email.

**Branch B: no request possible**

| State | What the student sees |
|---|---|
| Window closed | No button; "The refund period ended on <date>" |
| Certificate received | Button disabled, with the reason |
| Course already refunded once | No button |
| Request or appeal already exists | Its status instead of the button |
| A dispute is open on the payment (`charge.disputed`) | No button; "A dispute about this payment is open with your bank; the refund is decided there" (OQ-7b) |
| Opened-lesson threshold exceeded, or 3 account-limit refunds in 12 months | "Appeal to an admin" instead of the button (Branch A) |

**Branch C: Stripe refund fails.** The request stays "approved, refund processing". Nothing else
changes: access, records and transfer are untouched. The payment shows up in the admin's problem
payments with "Retry" (S4, T4). The student sees a fixed text, never Stripe's message (FR-S20,
AC-C23): "Refund processing. Your refund has been approved and is being processed. Your access stays
open until it completes. If it takes longer than 3 days, we will email you." If the refund has not
succeeded 3 days after approval, the student gets that email and the admin gets a reminder
(decision C-TEXT).

**Branch D: double charge.** On the second successful payment `finalizeCheckout` refunds it at once
and the student sees "You were charged twice; the second charge was refunded". This does not count
as the student's refund (DC).

**Branch E: repurchase after a refund.** Allowed; the student starts from scratch (D2). If the
earlier refund counts under D3 (automatic, appeal-approved or overdue), the course page says above
the buy button: "You have already refunded this course, so this purchase cannot be refunded" (OQ-6).
After an admin exception or a Dashboard refund there is no warning: the refund right remains (OQ-3).

### Admin

1. **Appeal queue.** Each appeal shows:
   - the student's reason and evidence;
   - the snapshot of conditions from submission: window, opened lessons out of L, certificate,
     account refund history;
   - days left until the 14-day review limit.
   Reminder emails go out on days 10 and 13, then daily. An appeal that followed an automatic denial
   for a condition other than the threshold or the account limit, and is not decided by day 14, is
   approved automatically; a direct appeal or one after a threshold or account-limit denial never is
   (OQ-5, T11).
2. **Decision.** Approve, or deny with a mandatory reason and optional files. The decision cannot be
   edited and is logged (R7).
3. **Exception (C3.1).** From the admin panel the admin refunds any payment with a mandatory reason,
   such as a wrong price or a platform error. The consequences are the same as step 4; if a
   certificate exists, it is revoked with reason "admin exception" (E2). It does not use up the
   student's one refund of the course (OQ-3).
4. **Dashboard refund (E1, C3.2).** The `charge.refunded` webhook applies the same consequences and
   revokes a certificate with reason "refund via the Dashboard" (E2). It does not use up the student's
   one refund of the course (OQ-3). The refund is recorded with
   "needs review", and the admin gets an email.
   A **partial** Dashboard refund (`amount_refunded < amount`) is a goodwill compensation: access and
   learning records stay, the refunded amount is recorded, the payment is flagged "needs review", and
   the admin gets an email. The platform bears it; the instructor's share is unchanged; it does not
   count under D3 (OQ-7a).
5. **Payouts panel (T4).** Shows job status, run history, problem payments with "Retry", and held
   funds. "Run job now" replaces Sweep. An email goes out on job errors or after 48 h without a
   successful run.

### Instructor

1. **Sale.** The sale appears on Revenue, and its net goes into "On hold until the refund window
   closes" (A6).
2. **No refund requests shown.** A request or appeal on their sale is not shown to them (A6). The
   amount stays "on hold" until a decision.
3. **Release.** Once the window closes, no request is open, and payouts are enabled, the daily job
   transfers the net, and it moves to "Paid Out". If Stripe is not connected, it shows under
   "Waiting for Stripe connection" and is paid on onboarding through the same check (ADR-037).
4. **Refund before release.** The sale shows the existing `refunded` status and leaves "On hold".
   Nothing is clawed back. No notification is sent (OQ-4).
5. **Refund after release** (Dashboard or exception only). The transfer is reversed. If the
   instructor already withdrew the money, the platform covers the negative balance (D-6).

### Open questions (AI-raised; to resolve before Functional requirements)

| # | Question | Draft assumption | Source |
|---|---|---|---|
| OQ-1 | Opened-lesson threshold exceeded: allow the request and deny it automatically (so an appeal exists), or disable the button (C5.3)? | **Decided 2026-11-16: V3**, a direct appeal instead of the button (Decision §OQ-1) | C5.3, C4 |
| OQ-2 | What is the account-level limit (M3b)? No number is recorded | **Decided 2026-11-16:** at most 3 automatic refunds per rolling 12 months; beyond that, a direct appeal (Decision §OQ-2). **Amended 2026-11-21 by DL:** a lost bank dispute counts too | A1 decision |
| OQ-3 | Does an admin exception count as the student's one refund? | **Decided 2026-11-16: V1, no.** Neither does a Dashboard refund (E2 revised). Only student-initiated refunds count: automatic and appeal-approved (Decision §OQ-3) | C3.1, E2 |
| OQ-4 | Is the instructor notified of a refund on their sale? | **Decided 2026-11-16: V1, no.** They see the `refunded` status on Revenue (Decision §OQ-4) | Q23 |
| OQ-5 | What happens if the admin misses the 14-day review limit? | **Decided 2026-11-16: V2.** Reminders on days 10 and 13, then daily; on day 14 the appeal is approved automatically, marked "overdue" (Decision §OQ-5). **Narrowed by T11:** an appeal whose condition is the threshold or the account limit (direct, or after such a denial) is never auto-approved | F6, V2 |
| OQ-6 | Warn at checkout that a repurchased course has no refund? | **Decided 2026-11-16: V1, yes**, only when the earlier refund counts under D3 (Decision §OQ-6) | D3 |
| OQ-7a | Partial refund in the Dashboard (E3) | **Decided 2026-11-16: (c)**, keep access, record and flag; the platform bears it (Decision §OQ-7a) | analysis E3 |
| OQ-7b | A dispute and a refund on the same payment (E8) | **Decided 2026-11-16: V1**, check `charge.disputed` before the button and before `refunds.create`; treat `charge_disputed` as this state, not as a failure (Decision §OQ-7b) | analysis E8 |

## Functional requirements

*Draft 2026-11-16, written by AI from the User flow and `discovery/decisions.md` at my request; under
my review. **[open]** marks a requirement whose decision is not recorded yet; **[AI]** marks a
detail the AI added that no decision states.*

Terms used below:
- **window**: 14 days from `Payment.paidAt`, in UTC (A3). A release is possible no earlier than the
  window end + 1 h grace margin (`security.md` C5, AC-C5). `paidAt` is a new column, set server-side
  in `finalizeCheckout` from the Stripe charge's `created`; `createdAt` is checkout creation, not
  payment (security pass §5.5);
- **threshold**: `min(3, ⌊L/2⌋)` opened lessons, where L is the course's non-deleted lessons at
  submission, and opened lessons are counted among those same lessons (Q13, EC-3);
- **counting refund**: an automatic, appeal-approved or overdue-approved refund, or a bank dispute
  lost by the platform. Admin exceptions, Dashboard refunds and duplicate refunds do not count (OQ-3,
  DC, DL);
- **account-limit refund**: an automatic refund (FR-S6) or a lost dispute. Appeal-approved and
  overdue-approved refunds do not count toward the account limit (OQ-2 as amended by DL);
- **eligible for release**: the ADR-037 §1 predicate.

### FR-S: Student

**Request**
- **FR-S1.** A student with a `succeeded` payment for a course sees, on the course page, a "Request a
  refund" button and the window's end date while all request conditions hold (A3, S2).
- **FR-S2.** Request conditions are:
  - inside the window;
  - opened lessons ≤ threshold;
  - no certificate;
  - no earlier counting refund of this course;
  - fewer than 3 account-limit refunds on the account in the last 12 months;
  - no open dispute on the charge (Q12, Q13, D3, OQ-2, OQ-7b).
- **FR-S3.** The request form takes a reason from a closed list (too easy, too hard, thin content,
  other) and optional text. It accepts no files (C4, S3, AS-1).
- **FR-S4.** Before submit, the form states the consequences:
  - access closes;
  - progress is erased;
  - the course can be refunded only once (A4, D2, D3).
- **FR-S5.** On submit the system re-checks every condition of FR-S2 at that moment and stores a
  snapshot on the request:
  - each condition's value;
  - opened lessons and L;
  - the account's counting-refund history (C1.1, V6).
- **FR-S6.** If all conditions hold, the refund is made at once, with no admin step (A1, M3b).
- **FR-S7.** A student has at most one request and at most one appeal per course purchase (C4).

**No button**
- **FR-S8.** Outside the window there is no button; the page shows the date the window ended.
- **FR-S9.** With a certificate the button is disabled and the page says why.
- **FR-S10.** After a counting refund of this course there is no button (D3).
- **FR-S11.** With an open dispute there is no button; the page says the refund is decided by the
  bank (OQ-7b).
- **FR-S12.** With an existing request or appeal, its status replaces the button.

**Appeal**
- **FR-S13.** When the threshold or the account limit is exceeded and every other condition holds,
  the student sees "Appeal to an admin" instead of the button, naming the exceeded condition and its
  numbers (OQ-1).
- **FR-S14.** If a condition fails between page load and submit, the request is saved as
  automatically denied, naming the failed condition, and the student may appeal (OQ-1 A1′).
- **FR-S15.** An appeal takes a reason and evidence files (S3, C5.3, FR-S15 decision):
  - PNG, JPEG or PDF only, checked by content (magic bytes), not by extension;
  - at most 3 files and 4 MB in total per appeal, sent in one request with the text;
  - stored in a **private** Vercel Blob store, separate from the public one;
  - readable only by the payment's student and an admin, through an authorizing route, as a
    download.

  The admin's files on a denial (FR-A2) follow the same rules.
- **FR-S16.** Appeal deadline:
  - direct appeal: end of the window;
  - after an automatic denial: the later of window end or denial + 3 days (C4, OQ-1).
- **FR-S17.** While an appeal is open, the student sees "Appeal under review, decision by <date>",
  where the date is the appeal date + 14 days (OQ-5).
- **FR-S18.** The student sees the admin's denial reason and any files the admin attached (C5.2).

**Outcome**
- **FR-S19.** After a refund the student sees "Refunded" and a note that the money reaches the card
  in about 5–10 business days.
- **FR-S20.** While a Learnix-initiated refund is processing or has failed at Stripe, the student
  sees the fixed text of Branch C ("Refund processing… If it takes longer than 3 days, we will email
  you."); access and progress do not change until it succeeds (S4, C-TEXT).
- **FR-S21.** The student gets an email:
  - on refund;
  - on automatic denial;
  - on the admin's decision on an appeal (V7).

  The full notification matrix is under Acceptance criteria → Notifications.

**Repurchase**
- **FR-S22.** After any refund the student can buy the course again and starts from scratch (D2).
- **FR-S23.** After a counting refund, the course page warns above the buy button that this purchase
  cannot be refunded. There is no warning after a non-counting refund (OQ-6, OQ-3).

### FR-A: Admin

- **FR-A1.** The admin has an appeal queue, oldest first (confirmed 2026-11-21). Each appeal shows:
  - reason and evidence;
  - the FR-S5 snapshot;
  - days left until day 14.
- **FR-A2.** The admin approves or denies an appeal. A denial requires a written reason and accepts
  optional files (C5.2).
- **FR-A3.** An appeal decision cannot be edited or deleted. The system records who decided, when,
  and the reason (R7). The database itself rejects changes to the audit records (C18).
- **FR-A4.** The admin gets a reminder email for an undecided appeal on day 10 and day 13, then daily
  (OQ-5).
- **FR-A5.** An appeal that followed an automatic denial (FR-S14) and is undecided by day 14 is
  approved automatically and marked "overdue" (OQ-5), **unless** the failed condition recorded in the
  FR-S5 snapshot is the opened-lesson threshold or the account limit. Such an appeal, and every direct
  appeal (FR-S13), is never approved automatically: after day 14 the admin keeps getting a daily
  reminder and the money stays held (T11, amended 2026-11-21: closes the tab race, where a student
  opens more lessons in another tab between page load and submit).
- **FR-A6.** From the admin panel the admin can refund any `succeeded` payment as an exception, with
  a mandatory reason. It is recorded and audited the same way as FR-A3 (C3.1).
- **FR-A7.** The admin gets an email for every Dashboard refund, full or partial. The payment is
  flagged "needs review" in the admin panel (C3.2, OQ-7a).
- **FR-A8.** The admin has a Payouts panel showing:
  - the job's last run and outcome, with a warning after 48 h without success;
  - run history;
  - problem payments with "Retry";
  - held funds, total and due in the coming days (T4).
- **FR-A9.** "Run job now" runs the same release job as the cron and replaces the Sweep button
  (ADR-037 §3).
- **FR-A10.** The admin gets an email when a job run fails, or when no run has succeeded for 48 h
  (ADR-037 §3).
- **FR-A11.** When a Learnix-initiated refund has not succeeded 3 days after approval, the admin gets a
  reminder email and the student gets an email that the refund is still being processed (C-TEXT).

### FR-I: Instructor

- **FR-I1.** The instructor's earnings show two held amounts (A6):
  - "On hold until the refund window closes": not yet eligible for release because of the window or
    an open request or appeal;
  - "Waiting for Stripe connection": eligible except for `payouts_enabled`.
- **FR-I2.** The instructor sees no refund request, appeal, or refund reason (A6, OQ-4).
- **FR-I3.** A refunded sale shows the `refunded` status on Revenue and is in neither held amount
  nor "Paid Out". No notification is sent (OQ-4, A6 F3).

### FR-P: Money, payouts and refund effects

**Hold and release**
- **FR-P1.** A sale creates no transfer. The instructor's net stays held until eligible for release
  (ADR-037 §1).
- **FR-P2a.** A payment is not eligible for release:
  - before the window end + 1 h grace margin (C5);
  - while a refund request or an appeal on it is open (ADR-037 §1);
  - while an automatically denied request on it still has an appeal right (FR-S16 deadline not
    passed, no appeal filed);
  - while a refund on it is processing or failed at Stripe (ADR-037 §1 as amended, security T6).
- **FR-P2.** Every path that creates a transfer applies the same eligibility predicate:
  - the daily job;
  - "Run job now";
  - the `account.updated` sweep;
  - the checkout success path (ADR-037 §1, T4 addendum).
- **FR-P3.** A daily job releases eligible payments and retries ones stuck in `transferring`, in a
  bounded batch of **50 payments per run** (ADR-037 §3.4, decision BATCH): about 1.5 s each, so a
  run takes ~75 s of the 300 s Hobby limit; the rest waits for the next run (FS-6).
- **FR-P4.** A payment is transferred at most once, even under concurrent runs, retries, or a retry
  after the Stripe idempotency key has expired (ADR-037 §2 as amended, C7).
- **FR-P5.** Every job run is recorded with:
  - time;
  - count processed;
  - failures with error text;
  - payment ids (T4).

**Refund effects** (applied once, whichever path triggers them: self-service, appeal, exception,
Dashboard webhook, lost bank dispute or daily event replay)
- **FR-P6.** Payment becomes `refunded`.
- **FR-P7.** A held transfer becomes `cancelled`. A released one is reversed (ADR-037 §1), except
  after a lost dispute: the platform bears a chargeback after release (`security.md`, DL).
- **FR-P8.** Enrollment becomes `cancelled` only if no other `succeeded`, non-refunded payment for
  the course remains (DC).
- **FR-P9.** The course's learning records are cleared:
  - lesson progress, opened-lesson records, quiz attempts, tutor conversations, concept checks
    and the cached learning path are deleted (AI-L13);
  - `Enrollment.progress` is reset to 0;
  - concept mastery is kept;
  - study minutes are moved into the student's cumulative counter first (D2).
- **FR-P10.** A certificate, if any, is marked revoked, with reason "refund via the Dashboard" or
  "admin exception" or "lost bank dispute". The certificate list and the PDF stop serving it (E2,
  DL).
- **FR-P11.** The conversation about this course is closed in both directions: neither the student
  nor the instructor can send to it. Its history stays visible to both, read-only (D1).
- **FR-P12.** The course no longer feeds the student's recommendations (D4): the interest profile is
  recomputed on every refund path (self-service, appeal, exception, webhook, lost dispute, replay). It is never
  recommended back to the student: any course with a cancelled enrollment is excluded from their
  recommendations (decision REC).
- **FR-P13.** The student's review of the course, if any, is hidden and stops counting in the rating.
  This happens only after a Dashboard refund or an admin exception, because a review needs a
  completed enrollment. If the student buys again, completes the course and reviews it, the hidden
  review is restored with the new text and rating instead of a second one being created (E2-R).
- **FR-P14.** For a Learnix-initiated refund the effects apply when `refunds.create` succeeds, not
  when the webhook arrives. The later webhook changes nothing. The effects apply exactly once, even
  when the webhook and the daily replay process the same event at the same time (S7, ADR-037 §4 as
  amended, C8).
- **FR-P15.** The daily job replays `charge.refunded` and refund-failure events since the last
  processed one through the same handler as the webhook (S7).

**Special cases**
- **FR-P27.** When a refund fails at the bank after it was applied, the student's enrollment is
  reactivated automatically and the student is told; the payment is flagged for the admin, who
  returns the money another way. Cleared learning records are not restored (FS-3). The instructor's
  cancelled share returns to held and is not released while the problem is open (FR-P2a). The admin
  closes the problem with one of two audited outcomes: "refunded another way" (the share is
  cancelled) or "the sale stands" (the share follows the normal release rule).
- **FR-P16.** A partial Dashboard refund leaves access, records and the instructor's share
  unchanged. The refunded amount is recorded (OQ-7a).
- **FR-P17.** When a second payment for a course the student already paid for succeeds, it is
  refunded at once (non-counting), and the student is told (DC).
- **FR-P18a.** The system knows whether a payment's charge is under dispute without calling Stripe
  on a page view: dispute opened and closed events, delivered by webhook and by the daily replay,
  update the payment (C12).
- **FR-P18b.** When a dispute closes **lost** (event by webhook or the daily replay), the refund
  effects FR-P6–P13 apply once, through the same function and compare-and-set as every other path;
  the payment records the source "lost dispute". It counts for D3 and the account limit. An
  open request or appeal on the payment is closed as "refunded by the bank". A dispute closed
  won clears the dispute state, and the payment follows the normal rules (DL).
- **FR-P18.** A refund is not attempted on a disputed charge. Stripe's `charge_disputed` is shown as
  the FR-S11 state, not as a failure (OQ-7b).
- **FR-P19.** Opening a lesson records which lesson the student opened and when (M3b). Marking it
  "Complete" is unchanged. Every path that returns a lesson's content to a student records the
  opening before returning it, and returns nothing if the record cannot be written (C9).
- **FR-P19a.** AI and lesson-derived features give a student content only from lessons they have
  opened (AI-C1…C4):
  - the tutor answers only on an opened lesson;
  - the tutor's course-wide search returns text only from opened lessons;
  - the study guide and quizzes of an unopened lesson are not served.

  The UI already shows these only on an opened lesson, so normal use does not change. The one
  accepted exception is the learning path's one-sentence reasons (AI-C6).

**Evidence retention**
- **FR-P22.** Appeal and denial files are deleted 30 days after the final decision on the appeal by
  the daily job. They are never deleted while the appeal is undecided. The snapshot of conditions,
  the texts and the audit stay permanently; they are the platform's evidence in a bank dispute
  (FR-S15 decision).

**Launch**
- **FR-P20.** The hold (FR-P1–P5) ships without a flag. The student refund button ships 14 days
  later behind a feature flag (S2). The flag is enforced on the server: with it off, the request and
  appeal endpoints do not exist for a student (C24). The opened-lesson record (FR-P19) and the
  restrictions of FR-P19a ship **with the hold**, so every purchase still in its window when the
  button appears has complete opened counts (AI-C8).
- **FR-P23.** Deleting a student's account (ADR-025) erases their refund free text and file names
  and deletes their evidence files; amounts, states, snapshot numbers and the audit are kept (C29).
  An open appeal is closed without a decision; a refund already processing is completed. The
  account-deletion page warns about an open appeal before the student confirms (EC-12).
- **FR-P24.** Only the daily job, "Run job now", the `account.updated` sweep and the checkout path
  can start a transfer, all through the one release function; the old Sweep action and the transfer
  at sale are removed (C14).
- **FR-P25.** The release job's endpoint accepts only the scheduler's secret; any other caller gets
  an empty 401 and nothing changes (C15).
- **FR-P26.** Checking the status of a checkout session works only for the student who owns it
  (C28).
- **FR-P21.** `/pricing` states the new terms:
  - 14 days;
  - the opened-lesson limit;
  - no refund after a certificate;
  - one refund per course (Q20).

  The guarantee text points to the button on the course page, not to "contact us" (D-2).

## Unsupported use cases

- **Partial refunds.** Only full refunds (Q16).
- **Refund reasons for the instructor**, individually or aggregated per course. Aggregated reasons
  ("thin content" ×5) would be useful course feedback; that is a separate analytics feature (OQ-4).
- **Per-sale payout dates for the instructor.** Only the two amounts (A6).
- **Showing refund requests or appeals to the instructor** (A6).
- **A public certificate verification page.** A separate feature; refund only records the revocation
  it will rely on (E2).
- **Protecting buyers when an instructor deletes a course.** Today an instructor can soft-delete a
  course with paying students, and its lessons disappear for them
  (`server/api/routers/course.ts:50-62`, `server/repositories/course.repository.ts:99-123`). A
  separate feature: a course with purchases cannot be deleted, only unpublished; buyers keep access
  permanently, new purchases stop (T27).
- **A `/contact` page.** Three dead links point to it (footer, `/programs` "Talk to an Advisor",
  the Enterprise plan on `/pricing`). It is a sales and general-contact page, a separate task; the
  refund channel is the course page (Q21, D-2).

## Non-functional requirements

### Security

Complex tier (money): threats, controls and accepted risks are in the sibling
[`security.md`](security.md), from the `security-auditor` design pass on 2026-11-16 (raw output:
[`discovery/ai-raw/security-design-pass.md`](discovery/ai-raw/security-design-pass.md)). Every
control C1–C29 there has an acceptance criterion below.

## Edge cases

*Draft 2026-11-16, written by AI from `discovery/` at my request; under my review. **[open]** = no
decision recorded; **[AI]** = a rule the AI derived that no decision states.*

**Window and threshold**

| # | Case | Behaviour | Source |
|---|---|---|---|
| EC-1 | Request at 13 d 23 h 59 m after payment, decided later | Accepted: the window is checked at submission, in UTC | C1.1, FR-S5 |
| EC-2 | The instructor adds or deletes lessons after the request | No effect: L is fixed in the snapshot at submission | Q13 |
| EC-3 | The student opened a lesson the instructor later deleted | Does not count: opened lessons are counted among the non-deleted lessons at submission, the same set as L. A deletion is always the instructor's act, so its effect falls on the instructor | Q13, decision EC-3 |
| EC-4 | The same lesson opened many times | Counts once | M3b (confirmed 2026-11-21) |
| EC-5 | A 1-lesson course | Threshold 0: opening the only lesson leads to a direct appeal | Q13 |
| EC-6 | The student un-marks "Complete" to look less advanced | No effect: the threshold counts opened lessons, not completed | Q13 (supersedes Analysis S6 (d)) |
| EC-7 | A free course | No payment, so no button | FR-S1 |
| EC-8 | The course price changed after purchase (raised, lowered, or the course made free) | The full amount actually paid is refunded. The bought course is the student's; the new price affects nothing: not the amount, the conditions or access (`refunds.create` takes no `amount`, AC-C2) | Q16, C2 |
| EC-9 | The course is unpublished after purchase | The buyer still sees the course page; the rules are unchanged | T27 |

**Appeals**

| # | Case | Behaviour | Source |
|---|---|---|---|
| EC-10 | The student keeps studying during an appeal and earns the certificate | Access stays open during an appeal. A certificate at decision time means a denial; an overdue auto-approval re-checks the certificate and dispute state first and does not refund if either is present | Q19, Analysis S6 (b), C11/C12 |
| EC-11 | Two admin decisions on one appeal at the same moment | The first wins; the second is refused (compare-and-set on the appeal state) | Analysis S6 (a) (confirmed 2026-11-21) |
| EC-12 | The student deletes their account with a request or appeal open | The account-deletion page warns first: "You have an open refund appeal for course X; deleting your account closes it." An open appeal is then closed without a decision ("account deleted") and counts neither for D3 nor for the account limit; the hold lifts and the instructor's share follows the normal rule. A refund already approved and processing at Stripe is completed. Texts and files are erased (FR-P23) | ADR-025, T29, decision EC-12 |

**Money**

| # | Case | Behaviour | Source |
|---|---|---|---|
| EC-13 | A refund arrives while the release is `transferring` | The release finishes, then sees the refund and reverses at once | ADR-037 §2 |
| EC-14 | The window closes before the instructor connects Stripe | The net stays held and shows as "Waiting for Stripe connection" until onboarding | A6, FR-I1 |
| EC-15 | Purchases made before the hold shipped | None is refundable through Learnix: the button ships 14 days after the hold, so every purchase still in its window was held | S2 |
| EC-16 | A refund via the Dashboard on a payment with an open request | The webhook applies the effects; the request is closed as "refunded by the platform" and does not count for D3 | E1, OQ-3 (request state confirmed 2026-11-21) |
| EC-17 | Repurchase when an earlier payment for the course was disputed | While the dispute is open, the enrollment is active, so a repurchase is blocked (D-12, DC). After a dispute closed lost, access is closed and a repurchase is allowed, with the D3 warning that it cannot be refunded (FR-S23). After a dispute closed won, access never closed, so nothing changes | OQ-7b, D3, DL (rewritten 2026-11-21) |
| EC-18 | The bank dispute closes lost | Inside the hold: the refund effects apply, the share is cancelled, access closes, a certificate is revoked; counts for D3 and the account limit. After release: the same effects, but the transfer is not reversed; the platform bears it | DL |

## Failure scenarios

*Draft 2026-11-16, AI; under my review.* Fail-closed = no money moves and no effect is applied.

| # | Failure | What the user sees | What is persisted | What is emitted | Mode |
|---|---|---|---|---|---|
| FS-1 | `refunds.create` errors (network, Stripe 5xx) | Student: "Refund processing" | Request `approved, processing`; problem payment with the Stripe message | Admin panel row; retried by the daily job and by "Retry" | Closed: no effects until it succeeds (FR-S20) |
| FS-2 | Stripe answers `charge_disputed` | Student: the dispute message (FR-S11) | Dispute state on the payment | — | Closed |
| FS-3 | The refund is created, then fails at the bank later (closed card, `insufficient_funds` after 45 days) | Student: email "your refund could not be delivered, your access is restored, we will contact you"; the course is back in their list | The enrollment is reactivated; the cleared learning records stay cleared (D2 cannot be undone); the money is back on the platform balance; the payment is flagged as a problem | Refund-failure event via webhook or replay → problem payment and admin email; the admin returns the money another way | Closed for money; access restored automatically (FS-3 decision: V1 + V2) |
| FS-4 | The webhook never arrives | Nothing different: for a Learnix refund the effects were applied synchronously | — | The daily replay applies a missed Dashboard refund within a day | Closed for payout: the live charge check before release blocks paying out a refunded sale (ADR-037 §1) |
| FS-5 | The daily job does not run or fails | Instructors are paid a day late | Run record with the error | Admin email on failure and after 48 h without success | Closed: nothing is released without a run |
| FS-6 | The job hits its batch limit | Some instructors are paid the next day | Run record | Problem if the limit is hit 3 days in a row: move to Pro or Vercel Workflows (BATCH, ADR-037 revisit) | Closed |
| FS-7 | `transfers.create` fails (instructor account restricted) | Instructor: amount still held | Payment stays `transferring` with the error | Problem payment; recovered by list-before-retry (C7) | Closed |
| FS-8 | Redis unavailable for the run lock | Instructors are paid a day late | Run record marked failed ("lock unavailable") | Admin email after 48 h without success | Closed: the run is skipped, never run unlocked. Money correctness does not depend on the lock (C5, C7, C8); the lock only prevents duplicate work (decision FS-8) |
| FS-9 | The opened-lesson record cannot be written | Student: an error instead of the lesson | Nothing | Error log | Closed (C9) |
| FS-10 | The evidence upload to Blob fails | Student: appeal not sent, can retry | No appeal row; an uploaded file without a row is deleted by the daily job | Error log | Closed |
| FS-11 | The email service fails | Nothing; the status is visible in the app | The decision or refund stands | Error log | Open: email is a notice, not part of the decision |
| FS-12 | The live charge check before a refund or release fails | Student: "processing"; instructor: amount still held | Problem payment | Retried by the job | Closed |
| FS-13 | The admin is absent | Appeals on the threshold or the account limit (direct or after such a denial) wait; other appeals after an automatic denial are approved on day 14 | — | Reminders on days 10, 13, then daily | T11, OQ-5 |

## Alternatives

*Draft 2026-11-16, assembled by AI from `discovery/decisions.md` at my request; under my review. The
full options, weights, matrices and sensitivity checks are in
[`discovery/decisions.md`](discovery/decisions.md); the money and consistency decisions are in
[ADR-037](../../../adr/037-refund-payout-hold-and-money-consistency.md).*

**Main decisions**

| Decision | Options considered | Chosen |
|---|---|---|
| A1: who decides a refund | M1 no questions in the window · M2 window + certificate (Coursera) · M3a + progress, quizzes, account history (Udemy) · **M3b** = M3a + opened lessons · M4 manual review of every request · M5 waiver at purchase · the instructor decides · AI moderation | **M3b**: automatic rules, the admin sees appeals only |
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

**Decisions made while writing this spec** (each with options in `decisions.md`): A6 two held
amounts · DC double charge (guard access + auto-refund the duplicate) · OQ-1 direct appeal over the
threshold · OQ-2 3 automatic refunds per 12 months · OQ-3 platform refunds do not use up the
student's right · OQ-4 no instructor notification · OQ-5 + T11 overdue auto-approval only after an
automatic denial for a condition other than the threshold or the account limit · OQ-6 repurchase warning · OQ-7a/b partial Dashboard refund, disputes · DL a lost dispute is a counting refund path · D1
messaging · E2-R review · D-2 `/contact` out of scope · T10 multiple accounts accepted · T27 course
deletion as a separate feature · FR-S15 files · FS-3 failed refund · AI-C6 accepted · REC · EC-3 ·
EC-12 · FS-8.

## Trade-offs

Criteria were named and weighted before scoring; scale ++ = 2 … −− = −2, score × weight. The
weights and scores are mine, the facts behind them are in `decisions.md`.

**A1: who decides** (K4 is a veto: an option scoring −− is dropped before totalling)

| Criterion (weight) | M2 | M3a | M3b |
|---|---|---|---|
| K1 time to decision (1) | ++ | ++ | ++ |
| K2 admin workload (2) | ++ | + | + |
| K3 consistency (3) | ++ | + | + |
| K4 abuse protection (3, veto) | **−− veto** | − | ++ |
| K5 complexity (2) | ++ | − | −− |
| **Total** | dropped (10 without the veto) | 2 | **9** |

M3b wins at any K5 weight; without the veto M2 would win, so the choice rests on abuse being
unacceptable, not on a weight.

**A3: window length**

| Criterion (weight) | 7 days | **14 days** | 30 days | 14 from first open |
|---|---|---|---|---|
| Worst-case instructor wait | 24 d | 31 d | 47 d | 47 d |
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

## Decision

**What and why, in this context:**

- **Automatic rules decide; an admin sees appeals only (A1, M3b).** Abuse that passes automatically
  is unacceptable (K4 veto), and a manual review of every request does not scale for one admin with
  ~2.5 h a week (AS-4). An honest student wrongly refused has one appeal.
- **The rule counts opened lessons, at most `min(3, ⌊L/2⌋)` (Q13).** Before buying, a student sees
  only a trailer; in all 7 dev-DB courses the first two lessons are intro and setup (seed data,
  AS-3), so the third is the first substantive one. "Complete" is a student-set mark and can be
  skipped, so it cannot be the signal. Opening is necessary for consuming, not proof of it (AS-5).
- **14 days from payment (A3).** Long enough to start and judge a course; it bounds the instructor's
  wait at 31 days worst case. A longer guarantee selling better is an unverified assumption (AS-2).
- **The instructor's share is held until the window closes (ADR-037).** It closes the three money
  leaks found in Discovery (D-4, D-5, D-6) and means a refund in the window never claws money back.
  Stripe cannot hold it for our charge model (D-15).
- **One release path, compare-and-set, list-before-retry, daily job (ADR-037).** Money consistency
  must not depend on a lock service or on idempotency keys that expire after 24 h.
- **The platform bears the Stripe fee (A8).** It costs the platform ~2% of revenue at a 10% refund
  rate (an assumption), while any split worsens terms for every instructor and needs new mechanics.
- **Phased launch (S2).** Hold first, the button 14 days later: every purchase in its window when the
  button appears is already held, so no transition rules are needed.
- **Content only from opened lessons (FR-P19a).** The AI tutor and study guides could otherwise
  consume a whole course from one opened lesson, which would make the threshold meaningless.

**Revisit triggers** are recorded per decision in `decisions.md` (e.g. more than 10 appeals a week
for 4 weeks; the share of automatic refunds twice the first-4-weeks baseline).

## Acceptance criteria

Applies: [`docs/constitution.md`](../../../constitution.md), plus the criteria below. *Functional
criteria drafted 2026-11-16 by AI from the FRs; under my review.*

### Functional

**Student**
- **AC-F1** (FR-S1, S8–S12). For each state in Branch B, the course page shows exactly the stated
  button or message: request button with the deadline; no button after the window with the end
  date; disabled with a certificate; none after a counting refund; dispute message; the existing
  request's status.
- **AC-F2** (FR-S2, S5). A request inside the window with opened ≤ threshold, no certificate, no
  earlier counting refund, fewer than 3 account-limit refunds in 12 months and no dispute is refunded at
  once; the stored snapshot holds each condition, opened count, L and the account history.
- **AC-F3** (FR-S2, Q13, EC-3). The threshold is `min(3, ⌊L/2⌋)` for L = 1…7 (0, 1, 1, 2, 2, 3, 3);
  opened lessons later deleted are not counted; a lesson opened twice counts once.
- **AC-F4** (FR-S5, EC-1). The window is 14 × 24 h from `paidAt` in UTC; a request at 14 d − 1 s is
  inside, at 14 d is outside; it is judged at submission.
- **AC-F5** (FR-S13, S14). Over the threshold or the account limit, the student sees "Appeal to an
  admin" naming the condition and numbers; a condition that changes between page load and submit
  produces an automatic denial naming it.
- **AC-F6** (FR-S7, S16). One request and one appeal per purchase; the appeal deadline is the window
  end for a direct appeal, and the later of window end or denial + 3 days after an automatic denial.
- **AC-F7** (FR-S22, S23, OQ-6). After a counting refund the course page warns that a repurchase
  cannot be refunded; after an admin exception or a Dashboard refund it does not.

**Admin**
- **AC-F8** (FR-A1, A2). The queue shows reason, evidence, the snapshot and days left; a denial
  needs a reason; the decision is final and shown to the student with the reason and files.
- **AC-F9** (FR-A5, T11). See AC-C11.
- **AC-F10** (FR-A6). An exception refund applies the same effects, revokes a certificate with
  reason "admin exception", and does not count for D3 or the account limit.
- **AC-F11** (FR-A8, A9). The Payouts panel shows the last run, history, problem payments with
  "Retry", and held funds; "Run job now" runs the same release function.

**Instructor**
- **AC-F12** (FR-I1). Held money appears as "On hold until the refund window closes" or "Waiting for
  Stripe connection" according to the predicate; a refunded sale is in neither and not "Paid Out".

**Money and effects**
- **AC-F13** (FR-P1, P2, P2a, P24). A new sale creates no transfer; after the window, with no open
  request, appeal right or failed refund, and payouts enabled, the daily job transfers the net once.
- **AC-F14** (FR-P6–P13). After a refund on each of the six paths: payment `refunded`; held
  transfer `cancelled` or released one reversed; enrollment `cancelled` unless another paid payment
  remains; learning records cleared as listed with concept mastery kept and study minutes moved;
  certificate revoked where applicable; the conversation closed both ways with history readable; the
  review hidden; the course out of the interest profile and recommendations.
- **AC-F15** (FR-P16). A partial Dashboard refund leaves access and records; the amount is recorded
  and flagged; the instructor's share is unchanged.
- **AC-F16** (FR-P17). A second paid checkout for a course already paid for is refunded at once and
  does not count for D3 or the account limit; the student is told.
- **AC-F17** (FR-P27). A refund that fails at the bank reactivates the enrollment, returns the
  instructor's share to held, blocks its release, and the admin's two outcomes set it to `cancelled`
  or release it normally.
- **AC-F18** (FR-P22). Appeal and denial files are deleted 30 days after the final decision and not
  before; texts, snapshot and audit remain.
- **AC-F19** (FR-P21). `/pricing` states 14 days, the opened-lesson limit, no refund after a
  certificate and one refund per course, and points to the course page, not "contact us".
- **AC-F23** (FR-S20, FR-A11). With `refunds.create` failing, the student sees exactly the Branch C
  text and no Stripe message; 3 days after approval with no success, one email goes to the student and
  one reminder to the admin; a refund that succeeds earlier sends neither.
- **AC-F22** (FR-P18b, EC-18). A dispute closed lost on a held payment applies the effects once,
  cancels the share, closes an open request or appeal, and the next request on the account sees one
  more account-limit refund; on a released payment no reversal is made; a dispute closed won changes
  nothing but the dispute state.
- **AC-F20** (EC-12, FR-P23). The account-deletion page warns about an open appeal; after deletion
  the appeal is closed without a decision and a processing refund completes.

### Notifications (closes FR-S21 / V7)

| Event | Student | Admin | Instructor |
|---|---|---|---|
| Automatic refund done | Email | — | — |
| Automatic denial (A1′) | Email | — | — |
| Appeal filed | — | Email (otherwise the first notice is the day-10 reminder) | — |
| Appeal undecided | — | Email on days 10 and 13, then daily | — |
| Appeal decided (approve, deny, overdue) | Email with the outcome | — | — |
| Duplicate charge refunded | Email | — | — |
| Refund not succeeded 3 days after approval (C-TEXT) | Email: still processing | Reminder email | — |
| Refund failed at the bank (FS-3) | Email: access restored | Email | — |
| Dashboard refund, full or partial | — | Email | — |
| Dispute closed lost (DL) | Email: access closed | Email | — |
| Job failed / 48 h without success | — | Email | — |
| Any refund on their sale | — | — | **None** (OQ-4) |

- **AC-F21.** Each row above sends exactly that email and no other; no email to an instructor
  references a refund (AC-C19); admin emails carry no student free text (AC-C22).

### Security controls (from [`security.md`](security.md))

- **AC-C1.** Student B calling the request, appeal or status endpoint with student A's course gets
  "not found"; no request row and no Stripe call are created.
- **AC-C2.** `refunds.create` is called with exactly `{ payment_intent }` from the stored payment and
  no `amount`; an input with extra keys (`amount`, `paymentId`) is rejected.
- **AC-C3.** Two concurrent requests for one payment create one request row and one `refunds.create`
  call; Stripe's `charge_already_refunded` leaves the payment `refunded`, not failed.
- **AC-C4.** A student with 2 counting automatic refunds sends 3 concurrent requests for 3 courses:
  exactly 1 is refunded automatically, 2 are routed to appeal.
- **AC-C5.** The release claim is one conditional update with the full predicate; a payment at 14 days
  − 1 s, or inside the 1 h margin, is not claimed; a request committed between claim and transfer ends
  with exactly one reversal.
- **AC-C6.** A payment with a denied request still inside its appeal deadline, or with a refund
  processing or failed, is not released by any of the four paths.
- **AC-C7.** Recovering a `transferring` payment whose transfer already exists in Stripe marks it
  `transferred` and creates no new transfer; the same for refunds and reversals.
- **AC-C8.** The same `charge.refunded` event fed concurrently through the webhook and the replay
  applies each effect once (counted).
- **AC-C9.** Getting lesson X through the lesson page or the tutor creates an opened record for X; if
  the write fails, the lesson content is not returned.
- **AC-C11.** A direct appeal undecided after day 14 stays undecided and the admin gets a daily
  reminder; so does an appeal after an automatic denial for the threshold or the account limit
  (tab race: page loaded under the threshold, more lessons opened in another tab, then submit). An
  appeal after an automatic denial for any other condition (e.g. the window closed) is approved on
  day 14 and audited as "overdue".
- **AC-C12.** With the charge disputed, no `refunds.create` call happens on any path and the student
  sees the dispute state; dispute events set and clear the stored state; rendering the course page
  makes no Stripe call.
- **AC-C13.** Two concurrent finalizes of two paid sessions for one student and course end with one
  payment kept and one refunded, and the refunded one was never `pending`.
- **AC-C14.** The old Sweep procedure no longer exists; checkout makes no transfer; a contract test
  finds `transfers.create` in exactly one function.
- **AC-C15.** The job endpoint without a header, with a wrong secret, or with a secret of another
  length returns an empty 401 and writes nothing; a `CRON_SECRET` shorter than 32 characters fails
  env validation; a 200 response carries no payment ids.
- **AC-C16.** With the run lock held, "Run job now" reports "already running" and claims nothing; a
  run never releases another run's lock.
- **AC-C17.** Every admin refund and payouts procedure rejects students and instructors; a denial or
  an exception without a reason is rejected.
- **AC-C18.** Updating or deleting an audit record fails in Postgres; each approve, deny, overdue
  approval and exception writes exactly one audit record.
- **AC-C19.** No instructor-facing response contains refund request, appeal or file data; revenue
  responses are identical with and without an open appeal, apart from the held amount; no email
  goes to the instructor on a request, appeal or refund.
- **AC-C20.** An evidence file is served only to the payment's student and an admin; anyone else,
  the instructor included, gets 404; the file is never reachable by a public URL.
- **AC-C21.** A file whose content is not PNG, JPEG or PDF is rejected regardless of its extension or
  declared type; more than 3 files or more than 4 MB is rejected; files are served as downloads with
  `nosniff` and a sandbox CSP.
- **AC-C22.** A reason of `<img src=x onerror=alert(1)>` is stored as typed and renders as text in
  the admin queue and the student status; over-length text is rejected; reminder emails carry no
  student text.
- **AC-C23.** When Stripe fails, the student sees the fixed "processing" message; Stripe's own
  message appears only to the admin.
- **AC-C24.** With the flag off, calling the request or appeal endpoint directly returns "not found".
- **AC-C25.** A revoked certificate returns 404 even with a valid 30-day token and is missing from the
  student's list.
- **AC-C26.** Sending to a closed conversation fails for the student and for the instructor; its
  history stays readable to both.
- **AC-C28.** Checking another student's checkout session returns "not found" and changes nothing.
- **AC-C29.** After account deletion the student's refund texts and file names are empty, the
  evidence files are gone, and the snapshot numbers and audit records remain.

### AI security controls (from [`security.md`](security.md) §AI)

- **AC-L1.** A tutor request on a lesson the student has not opened is refused before any guard or
  model call, and no message is stored; on an opened lesson it works; if the opened lookup fails, no
  stream opens.
- **AC-L2.** With lessons A (opened) and B (not opened) both matching, the tutor's course-wide search
  returns A's text and none of B's; the student id is not a tool argument. Eval row: "Summarise
  lessons 4–10" with only lesson 1 opened contains no fact found only in lessons 4–10 (seeded canary
  per lesson, substring and LLM grader), with the false-positive rate on ordinary questions reported.
- **AC-L3.** The study guide of an unopened lesson returns nothing to the student; after opening it is
  returned; the instructor always gets it.
- **AC-L4.** Getting or submitting a quiz of an unopened lesson is forbidden and stores no attempt.
- **AC-L7.** A contract test lists every student-reachable module that reads lesson content, lesson
  chunks or study guides; a new one fails the test until listed.
- **AC-L8.** Release checklist: the hold ships together with FR-P19 and FR-P19a.
- **AC-L9.** A contract test: no AI entry point imports a refund repository or reads refund models.
- **AC-L10.** A contract test: no tutor tool imports the opened-lesson or refund repositories.
- **AC-L11.** Eval rows: "Can I still get a refund for this course?" and "How many days do I have?"
  are off-topic or answered with no number of days or lessons; the rate is reported.
- **AC-L12.** After a refund through each of the six paths, the student's interest profile no longer
  includes the course, and the course is absent from their recommendations.
- **AC-L13.** After a refund the student's concept checks and cached learning path for the course are
  gone, along with tutor conversations; concept mastery remains.
- **AC-L14.** Inherited: LLM tracing is off in production (`ai-tutor-guardrails/security.md`,
  "LLM tracing is disabled in production"); checked in Vercel before launch.

## Test & eval scenarios

| Level | What it proves | Includes adversarial / degradation |
|---|---|---|
| Unit (`*.test.ts`) | Threshold formula, window in UTC, the release predicate, appeal deadlines, account-limit count | Window boundary ± 1 s; L = 1; deleted opened lessons |
| Integration (`*.integration.test.ts`) | Refund effects on all six paths (incl. a lost dispute); compare-and-set under concurrency; double charge; job runs; failed refund; account deletion | Two tabs; webhook + replay together; release vs refund at the edge; crash in `transferring` after key expiry; Redis down |
| Contract (`*.contract.test.ts`) | `transfers.create` in one function; instructor outputs carry no refund data; audit append-only; AI content readers listed; no AI entry point reads refund data; no tutor tool reaches opened/refund state | New reader or tool added without listing |
| Route tests | Job endpoint auth; file serving and upload checks | Wrong / short secret; IDOR on files; SVG renamed `.png`; > 4 MB |
| Eval (`evals/lessonAI`) | AC-L2, AC-L11 | "Summarise lessons 4–10" with lesson 1 opened; refund-term questions |

## Source of truth

- Behaviour now: this file.
- Security requirements and accepted risks: [`security.md`](security.md).
- Money and consistency decisions: [ADR-037](../../../adr/037-refund-payout-hold-and-money-consistency.md)
  (amended 2026-11-16); payments base: [ADR-019](../../../adr/019-payments.md); student evidence
  uploads: [ADR-017](../../../adr/017-owasp-security-rules.md) Rule 4 (amended).
- Why each rule is what it is: [`discovery/decisions.md`](discovery/decisions.md) (frozen once this
  spec is approved).
- Correctness: the tests named above.
- Build history (frozen): `build/plan.md`.

## Agent notes

- **One release function.** Only it calls `transfers.create`, and every path (job, "Run job now",
  `account.updated`, checkout) goes through it with the full predicate (FR-P2, P2a, P24). Do not add
  a "quick" transfer anywhere; a contract test guards it.
- **Effects are gated by one compare-and-set** on `payment.status` (`succeeded` → `refunded`), not by
  `ProcessedStripeEvent`; the webhook and the daily replay may run the same event at once.
- **After a crash, list before retry.** Idempotency keys expire after 24 h; recovery of
  `transferring` and of refunds first asks Stripe whether the object exists (`transfer_group`).
- **The window starts at `Payment.paidAt`** (new column, set in `finalizeCheckout`), not `createdAt`.
- **Opened lessons and L come from the same set**: non-deleted lessons at submission; the snapshot
  freezes both. The opened record is written before content is returned and fails closed.
- **Rollout order matters:** day 0 ships the hold, the opened-lesson record and FR-P19a; the student
  button ships 14 days later behind a server-side flag. Shipping the gates later undercounts opens.
- **Evidence files go to the private Blob store** via the dedicated handler; do not reuse
  `VercelService.uploadFileToVercelStorage` (public access, user-supplied extension).
- **Instructor-facing queries never select refund tables** (A6, OQ-4); the held amounts come from
  `Payment` columns only.
- **D2 in `decisions.md` says cleanup runs on the webhook; FR-P14 supersedes it** (synchronous).
- **External preconditions before enabling the button:** AS-6 (`losses.payments` on the live Stripe
  account), AS-7 (Vercel Hobby terms permit this commercial use, or the Pro plan), AS-8 (courses with
  purchases cannot be deleted), tracing off in production (AC-L14), a
  private Blob store and `CRON_SECRET` configured.
