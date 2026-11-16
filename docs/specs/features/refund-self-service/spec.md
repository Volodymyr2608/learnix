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
   - fewer than 3 automatic refunds on the account in the last 12 months (OQ-2).
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
  that followed an automatic denial is approved automatically and marked "overdue" in the audit
  (OQ-5). A direct appeal is not: the admin keeps getting reminders (T11).
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
| Opened-lesson threshold exceeded, or 3 automatic refunds in 12 months | "Appeal to an admin" instead of the button (Branch A) |

**Branch C: Stripe refund fails.** The request stays "approved, refund processing". Nothing else
changes: access, records and transfer are untouched. The payment shows up in the admin's problem
payments with "Retry" (S4, T4). **[unverified: the student-facing text]**

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
   and is not decided by day 14 is approved automatically; a direct appeal never is (OQ-5, T11).
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
| OQ-2 | What is the account-level limit (M3b)? No number is recorded | **Decided 2026-11-16:** at most 3 automatic refunds per rolling 12 months; beyond that, a direct appeal (Decision §OQ-2) | A1 decision |
| OQ-3 | Does an admin exception count as the student's one refund? | **Decided 2026-11-16: V1, no.** Neither does a Dashboard refund (E2 revised). Only student-initiated refunds count: automatic and appeal-approved (Decision §OQ-3) | C3.1, E2 |
| OQ-4 | Is the instructor notified of a refund on their sale? | **Decided 2026-11-16: V1, no.** They see the `refunded` status on Revenue (Decision §OQ-4) | Q23 |
| OQ-5 | What happens if the admin misses the 14-day review limit? | **Decided 2026-11-16: V2.** Reminders on days 10 and 13, then daily; on day 14 the appeal is approved automatically, marked "overdue" (Decision §OQ-5). **Narrowed by T11:** direct appeals are never auto-approved | F6, V2 |
| OQ-6 | Warn at checkout that a repurchased course has no refund? | **Decided 2026-11-16: V1, yes**, only when the earlier refund counts under D3 (Decision §OQ-6) | D3 |
| OQ-7a | Partial refund in the Dashboard (E3) | **Decided 2026-11-16: (c)**, keep access, record and flag; the platform bears it (Decision §OQ-7a) | analysis E3 |
| OQ-7b | A dispute and a refund on the same payment (E8) | **Decided 2026-11-16: V1**, check `charge.disputed` before the button and before `refunds.create`; treat `charge_disputed` as this state, not as a failure (Decision §OQ-7b) | analysis E8 |

## Functional requirements

*Draft 2026-11-16, written by AI from the User flow and `discovery/decisions.md` at my request; under
my review. **[open]** marks a requirement whose decision is not recorded yet; **[AI]** marks a
detail the AI added that no decision states.*

Terms used below:
- **window**: 14 days from `Payment.paidAt`, in UTC (A3). `paidAt` is a new column, set server-side
  in `finalizeCheckout` from the Stripe charge's `created`; `createdAt` is checkout creation, not
  payment (security pass §5.5);
- **threshold**: `min(3, ⌊L/2⌋)` opened lessons, where L is the course's non-deleted lessons at
  submission (Q13);
- **counting refund**: an automatic, appeal-approved or overdue-approved refund. Admin exceptions,
  Dashboard refunds and duplicate refunds do not count (OQ-3, DC);
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
  - fewer than 3 automatic refunds on the account in the last 12 months;
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
  sees "Refund processing"; access and progress do not change until it succeeds (S4).
- **FR-S21.** The student gets an email:
  - on refund;
  - on automatic denial;
  - on the admin's decision on an appeal (V7).

  **[open]** Full notification matrix (V7).

**Repurchase**
- **FR-S22.** After any refund the student can buy the course again and starts from scratch (D2).
- **FR-S23.** After a counting refund, the course page warns above the buy button that this purchase
  cannot be refunded. There is no warning after a non-counting refund (OQ-6, OQ-3).

### FR-A: Admin

- **FR-A1.** The admin has an appeal queue, oldest first **[AI]**. Each appeal shows:
  - reason and evidence;
  - the FR-S5 snapshot;
  - days left until day 14.
- **FR-A2.** The admin approves or denies an appeal. A denial requires a written reason and accepts
  optional files (C5.2).
- **FR-A3.** An appeal decision cannot be edited or deleted. The system records who decided, when,
  and the reason (R7).
- **FR-A4.** The admin gets a reminder email for an undecided appeal on day 10 and day 13, then daily
  (OQ-5).
- **FR-A5.** An appeal that followed an automatic denial (FR-S14) and is undecided by day 14 is
  approved automatically and marked "overdue" (OQ-5). A direct appeal (FR-S13: threshold or account
  limit) is never approved automatically: after day 14 the admin keeps getting a daily reminder and
  the money stays held (T11).
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
- **FR-P2a.** A payment is not eligible for release while an automatically denied request on it
  still has an appeal right (FR-S16 deadline not passed, no appeal filed), or while a refund on it is
  processing or failed at Stripe (ADR-037 §1 as amended, security T6).
- **FR-P2.** Every path that creates a transfer applies the same eligibility predicate:
  - the daily job;
  - "Run job now";
  - the `account.updated` sweep;
  - the checkout success path (ADR-037 §1, T4 addendum).
- **FR-P3.** A daily job releases eligible payments and retries ones stuck in `transferring`, in a
  bounded batch. **[open]** Batch size (ADR-037 §3.4).
- **FR-P4.** A payment is transferred at most once, even under concurrent runs or retries
  (ADR-037 §2).
- **FR-P5.** Every job run is recorded with:
  - time;
  - count processed;
  - failures with error text;
  - payment ids (T4).

**Refund effects** (applied once, whichever path triggers them: self-service, appeal, exception,
Dashboard webhook or daily event replay)
- **FR-P6.** Payment becomes `refunded`.
- **FR-P7.** A held transfer becomes `cancelled`. A released one is reversed (ADR-037 §1).
- **FR-P8.** Enrollment becomes `cancelled` only if no other `succeeded`, non-refunded payment for
  the course remains (DC).
- **FR-P9.** The course's learning records are cleared:
  - lesson progress, opened-lesson records, quiz attempts and tutor conversations are deleted;
  - `Enrollment.progress` is reset to 0;
  - concept mastery is kept;
  - study minutes are moved into the student's cumulative counter first (D2).
- **FR-P10.** A certificate, if any, is marked revoked, with reason "refund via the Dashboard" or
  "admin exception". The certificate list and the PDF stop serving it (E2).
- **FR-P11.** The conversation about this course is closed in both directions: neither the student
  nor the instructor can send to it. Its history stays visible to both, read-only (D1).
- **FR-P12.** The course no longer feeds the student's recommendations (D4).
- **FR-P13.** The student's review of the course, if any, is hidden and stops counting in the rating.
  This happens only after a Dashboard refund or an admin exception, because a review needs a
  completed enrollment. If the student buys again, completes the course and reviews it, the hidden
  review is restored with the new text and rating instead of a second one being created (E2-R).
- **FR-P14.** For a Learnix-initiated refund the effects apply when `refunds.create` succeeds, not
  when the webhook arrives. The later webhook changes nothing (S7, ADR-037 §4).
- **FR-P15.** The daily job replays `charge.refunded` and refund-failure events since the last
  processed one through the same handler as the webhook (S7).

**Special cases**
- **FR-P16.** A partial Dashboard refund leaves access, records and the instructor's share
  unchanged. The refunded amount is recorded (OQ-7a).
- **FR-P17.** When a second payment for a course the student already paid for succeeds, it is
  refunded at once (non-counting), and the student is told (DC).
- **FR-P18.** A refund is not attempted on a disputed charge. Stripe's `charge_disputed` is shown as
  the FR-S11 state, not as a failure (OQ-7b).
- **FR-P19.** Opening a lesson records which lesson the student opened and when (M3b). Marking it
  "Complete" is unchanged.

**Evidence retention**
- **FR-P22.** Appeal and denial files are deleted 30 days after the final decision on the appeal by
  the daily job. They are never deleted while the appeal is undecided. The snapshot of conditions,
  the texts and the audit stay permanently; they are the platform's evidence in a bank dispute
  (FR-S15 decision).

**Launch**
- **FR-P20.** The hold (FR-P1–P5) ships without a flag. The student refund button ships 14 days
  later behind a feature flag (S2).
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
