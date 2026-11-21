# AI response: Analysis (part 4)

**Date:** 2026-11-08
**Model:** Claude (a separate agent, with no access to the code, the repo, the web, or the conversation)
**Context the AI had:** the Problem section + the Q1–Q25 table + the ambiguities A1–A8 from
`../discovery.md` **in its state before Analysis**: the annotations dated 2026-11-08, added during Analysis
(Q8, Q13, Q18, Q19, A2, A4, A5), were cut out. The AI did not see `../analysis.md`.
**Prompt:** verbatim from the SDD guide (stage 3). The only additions: numbering findings by category, "do not
repeat Confirmed", and at the end "the 5 most important questions for the PO".

The text below is the AI response, translated into English; otherwise unedited.

---

# Analysis of the Refund requirements (Problem + Discovery Q1–Q25, A1–A8)

The analysis relies only on the provided document. Facts with Confirmed status (Q2–Q9, Q25) are not repeated here as findings. The conclusions rely on them.

---

## 1. Contradictions (S)

**S1. A refund request submitted inside the window, and a decision after the window closes (Q12(1), Q14, Q18, Q19)**
- **Problem.** Q12 requires the refund to be "within the window". Q19 says the admin assesses the state "at the moment of the decision". Q18 defers the instructor's payout until the window closes. If a refund request is submitted on day 29 and reviewed on day 32, then under Q19 the window condition is checked at the moment of the decision, and the refund request has to be rejected. By the spirit of Q12 (the student submitted in time) it should be approved. On top of that, under Q18 the instructor's share already went to them on day 30.
- **Why it matters.** Q18 protects against reversal only if no refund ever happens after the payout. This situation breaks exactly that assumption.
- **Impact.** The Q8/Q9 risks come back. A student who submitted a refund request in time may be unfairly refused. Instructor payouts become unpredictable.
- **Question.** At what moment is each of the three Q12 conditions checked: at the moment the refund request is submitted or at the moment of the decision? Is the instructor's share held while the refund request is open, even if the window has already passed?

**S2. "Q18 removes the Q8 and Q9 risks" and old purchases (Q15, Q18)**
- **Problem.** Q15: the new rules apply to old purchases too. But for old purchases the transfer to the instructor has already happened (Q5) or is sitting in `pending`. The hold from Q18 does not apply to them retroactively. So for old purchases inside the window, the Q8 and Q9 risks remain.
- **Why it matters.** The claim "removes the risks" is true only for purchases made after launch.
- **Impact.** A transition period during which reversal and a negative balance (Q9/Q25) are still possible. The Q8 risk (payout of a refunded sale through the sweep) also remains unless it is closed separately.
- **Question.** Is Q8 considered closed by Q18 alone, or separately, through a refund-status check in the sweep? How does the system handle purchases made before launch, inside their window?

**S3. "Q18 removes Q8" and the already existing `pending` mechanism (Q5, Q8, Q18)**
- **Problem.** Q8 describes a bug: the sweep takes all `pending` without checking for a refund. Q18 only pushes back the moment of the transfer. If after the window closes the transfer is performed by the same sweep without a check, the bug just shifts in time. Instructors without `payouts_enabled` get money through the sweep at some arbitrary later moment anyway.
- **Why it matters.** Q21 explicitly includes Q8 in scope, but Q18 presents it as already closed.
- **Impact.** The instructor is paid for a refunded sale, and the platform loses money.
- **Question.** Is "no transfer is performed for a payment with status `refunded`" a separate requirement, independent of Q18?

**S4. "The Q7/Q8 holes are closed" and the open A5 (value table, A4, A5)**
- **Problem.** Q7 is closed by prevention: the certificate blocks the refund, so there is nothing to revoke (A4). This works only if every refund goes through a refund request. If the manual path through the Stripe Dashboard remains (A5), a refund without a certificate check is possible, and Q7 is not closed.
- **Why it matters.** The value for the platform is presented in the table as achieved, although it depends on the unresolved A5.
- **Impact.** The abuse "finished the course, got the certificate, got the money back" remains possible.
- **Question.** If A5 = "yes, as an emergency path", what happens to the certificate and the held share on a refund from the Dashboard?

**S5. "The student refunds the money themselves" and the admin's decision (section "If we do nothing", Q10)**
- **Problem.** In Problem, the problem is framed as "the student cannot refund the money themselves". Under Q10 the student still cannot refund the money themselves: they only ask, and the admin makes the decision.
- **Why it matters.** The success criteria and the text on `/pricing` (Q20) depend on how the value is framed.
- **Impact.** The student's expectations ("I refunded it myself") do not match the real flow ("I asked and I'm waiting").
- **Question.** What is the target value for the student: a request channel with a visible status, or an instant refund?

**S6. The Q21 rationale and the Q10 decision**
- **Problem.** Q21 justifies the refund request in Learnix by saying that "all three Q12 conditions are data the system already has". That is the same argument as the one in favor of automation (A1). Meanwhile Q10 chooses a manual admin decision, and Q19 admits that admin speed becomes critical.
- **Why it matters.** If the conditions are fully formalized, it is unclear what admin judgment adds beyond the rules. If they are not formalized, the Q21 argument weakens.
- **Impact.** The choice in A1, admin workload, SLA.
- **Question.** What decisions does the admin make beyond the three formal Q12 conditions? Can they reject a refund request that meets all the conditions, or approve a refund request that does not meet them?

---

## 2. Missing requirements (V)

**V1. Rejection: reason, notification, repeat refund request**
- **Problem.** Only approval is described. It does not say whether a rejection has a reason, whether the student sees it, whether a refund request can be submitted again, and how many times.
- **Why it matters.** Q21 promises the student a "visible status". A "rejected" status without explanation recreates the "no channel" problem.
- **Impact.** UX, admin workload, refund request spam.
- **Question.** Is a rejection reason mandatory? Is a repeat refund request for the same purchase allowed, and under what conditions?

**V2. Review SLA (Q19)**
- **Problem.** Q19 calls review speed a requirement, but there is no number.
- **Why it matters.** Without an SLA it is impossible to verify Q19, and S1 too (a refund request at the edge of the window).
- **Impact.** Fairness for the student, delay of the instructor's payouts.
- **Question.** What is the maximum review time? What happens if it is exceeded?

**V3. Course access while the refund request is under review**
- **Problem.** It is not defined whether the student keeps access and can keep going through the course. Q19 silently assumes they can.
- **Why it matters.** It determines whether there is a guaranteed window for abuse between submission and decision.
- **Impact.** Conditions Q12(2) and Q12(3) can change during the review.
- **Question.** Does the student's access to the course change after the refund request is submitted?

**V4. Refund reason as a field**
- **Problem.** Q1 plans to check the reasons "in requests after launch", and Q23 asks whether the instructor sees the reason. There is no requirement to collect the reason.
- **Why it matters.** Without this requirement it is impossible to verify the Q1 assumption.
- **Impact.** Hypothesis validation, data for instructors.
- **Question.** Is the reason mandatory? Is it free-form (free text) or chosen from a list? Who sees it?

**V5. Cancellation of a refund request by the student**
- **Problem.** Not described.
- **Question.** Can the student withdraw a refund request, and does that affect the hold on the instructor's share?

**V6. Decision audit**
- **Problem.** There is no requirement to record who made the decision and when, and what progress and certificate state the admin saw at that moment.
- **Why it matters.** Q19 depends on "the state at the moment of the decision". Without a snapshot of that state, the decision cannot be verified later, for example on a complaint or a dispute.
- **Question.** Should a snapshot of the Q12 conditions at the moment of the decision be stored?

**V7. Notifications**
- **Problem.** Q23 leaves notifications for the instructor open. Notifications for the student (status change) and for the admin (new refund request) are not described either.
- **Why it matters.** Without a notification to the admin, the SLA from V2 is unreachable.
- **Question.** Who gets notified, about what, and through which channel?

**V8. Reconciliation of manual refunds (A5)**
- **Problem.** If a refund can appear without a refund request, there is no requirement for how the system reflects it ("orphan" refund request, status, held share).
- **Question.** What should a refund initiated outside Learnix look like in the product?

**V9. Purchases with a zero or reduced amount**
- **Problem.** The document does not say whether discounts, coupons, or free courses exist and how refund applies to them. I am not inventing a rule here, only recording the gap.
- **Question.** Are there purchases whose amount differs from the course price? What does "full refund" (Q16) mean for them?

**V10. Success metrics**
- **Problem.** Q11 proposes comparing conversion "before/after", but the baseline and the success threshold are not defined. There are no metrics for the refund rate or review time either.
- **Question.** What numbers mean the feature has reached its goal?

**V11. Repeat purchase after a refund**
- **Problem.** It is not defined whether the course can be bought again and whether a new refund window then applies.
- **Why it matters.** The cycle "bought → refunded → bought" can bypass the progress threshold (see E5).
- **Question.** Is the number of refunds per course or per user limited?

---

## 3. Ambiguous wording (N)

**N1. "Certificate received" (Q12(3), Q7, Q19)**
- **Problem.** Under Q7 the certificate depends on `completedAt`. It is unclear what "received" means: the condition is met (`completedAt` is set), generated, or downloaded.
- **Impact.** The boundary beyond which a refund becomes impossible.
- **Question.** Which event makes a refund impossible?

**N2. "Counted from the moment of payment" (Q14)**
- **Problem.** It is not defined what the moment of payment is (creation of the payment or its success), whether the last day is counted inclusively or not, and in which time zone.
- **Impact.** Edge-case refund requests (S1), the moment of the instructor's payout.
- **Question.** Which exact event starts the count, and how is the boundary calculated?

**N3. "Window closing" for the payout (Q18)**
- **Problem.** It is unclear whether this is a calendar date, or the date after which there are no more open refund requests (S1).
- **Question.** Can an open refund request push back the payout?

**N4. "Empty course" as a reason (Q1, definition of Refund)**
- **Problem.** "Empty" is not defined anywhere. If a course has few lessons, any progress percentage (A2) can exceed the threshold on the very first lesson.
- **Impact.** An empty course is exactly the case where the student is most entitled to a refund, and a percentage threshold can block it.
- **Question.** Do the Q12 conditions apply the same way to all refund reasons from Q1?

**N5. "Progress" as of when (A2 + Q19)**
- **Problem.** A2 asks how to calculate progress, not when to calculate it. Q19 says "at the moment of the decision" only about the certificate.
- **Question.** Is the progress threshold checked at the moment the refund request is submitted or at the moment of the decision?

**N6. "Visible refund request status" and "a queue with progress and certificate" (Q21)**
- **Problem.** Neither the statuses nor the fields the admin sees are listed.
- **Question.** What states does a refund request have? What exactly from the progress is shown to the admin?

**N7. "Preliminary" decision (Q10, Q18)**
- **Problem.** It is unclear whether further decisions can be built on these decisions (Q14, Q19, Q21 depend on them), or whether they can still change.
- **Question.** What happens to the dependent decisions if A1 or Q18 is revisited?

**N8. Scope boundaries of dispute/chargeback (Q9)**
- **Problem.** Q9 defers disputes after the window "to Analysis", but does not say whether this is in the feature's scope.
- **Question.** Is dispute/chargeback handling in the scope of Refund, or is it a separate feature?

---

## 4. Edge cases (E)

**E1. Refund request submitted on the last day of the window** — see S1.

**E2. Certificate received between approval and the actual refund**
- **Problem.** Q19 covers only the period before the decision. Between approval and processing of the `charge.refunded` webhook (Q4) the student still has access and can finish the course.
- **Question.** Is access closed at the moment of approval, or only after confirmation from Stripe?

**E3. Manual refund from the Dashboard while the refund request in Learnix is still open (A5)**
- **Problem.** The refund request stays "under review", although the money has already been refunded. The admin may approve it a second time.
- **Question.** How does the refund request find out that the refund has already happened?

**E4. Partial refund from the Dashboard (Q16)**
- **Problem.** Q16 forbids partial refunds in the product, but the Dashboard allows them. It is not defined how the system behaves on a partial `charge.refunded` (Q4: payment → `refunded`, enrollment → `cancelled`?).
- **Question.** Is a partial refund from the Dashboard considered a refund from the point of view of access, certificate, and payout?

**E5. Repeat purchase after a refund**
- **Problem.** It is unknown whether progress and `completedAt` from the previous enrollment are kept (Q7 says `completedAt` is not cleared). Hence two options: either the Q12(2) threshold or the certificate will block the new refund request because of the old data, or, conversely, after a progress reset the cycle repeats.
- **Question.** What happens to progress and the certificate on a repeat purchase?

**E6. The course changed after purchase**
- **Problem.** The instructor added or removed lessons, and the progress share changed without any action by the student. The course was deleted (soft-delete) or unpublished.
- **Question.** Which version of the course is progress calculated from? Can a student get a refund for a deleted course?

**E7. Changes on the instructor's side during the hold (Q18)**
- **Problem.** The instructor disconnected Stripe, lost `payouts_enabled`, or deleted their account while the money is being held.
- **Question.** What happens to the held share after the window closes in these cases?

**E8. Dispute/chargeback**
- **Problem.** A dispute is opened while the refund request is under review. Or a dispute arrives after an approved refund. Or after the window closes (Q9).
- **Question.** Does an open dispute block the review of the refund request? Who makes sure the money is not refunded twice?

**E9. The student deleted their account while a refund request is open or the money is being held.**
- **Question.** What happens to the refund request and to the instructor's portion?

**E10. Stripe limits on refunding an old payment (Q14)**
- **Problem.** If the window or the review goes beyond the limits within which Stripe allows a refund, an approved refund is technically impossible.
- **Question.** What is the limit, and how does it cap the maximum length of the window together with the SLA?

---

## 5. Failure scenarios (F)

**F1. The admin approved, the refund call to Stripe failed** (network, rate limit, insufficient platform balance — Q17/Q9)
- **Impact.** The refund request is "approved", but the money was not refunded. The student sees a false status.
- **Question.** Which refund request states reflect "approved, but the refund was not performed"? Who retries, and how?

**F2. The refund was accepted by Stripe but later did not go through** (closed card, asynchronous failure)
- **Impact.** The enrollment is already `cancelled`, but the student did not get the money.
- **Question.** How does the system react to a failed refund after it was accepted?

**F3. The `charge.refunded` webhook got lost, was delayed, or arrived twice (Q4)**
- **Impact.** Access is not closed, the transfer is not cancelled, or the effect is applied twice.
- **Question.** What is the source of truth for the refund status: the API response or the webhook? Is an idempotency requirement needed at the product level?

**F4. Sweep and refund at the same time (Q8)**
- **Impact.** The transfer is performed at the moment the payment is already being refunded.
- **Question.** Is a guarantee needed that the payout and the refund of the same payment will not happen at the same time?

**F5. Payout failure after the window closes**
- **Impact.** The instructor does not get the money, although Q18 promises it "after the window closes".
- **Question.** Does the instructor see the failure, and how long can the delay last?

**F6. The admin is unavailable (vacation)**
- **Impact.** Q19 turns this into a direct loss for the student. Windows expire, and because of S1 the risk for the instructor grows.
- **Question.** What happens to refund requests that were not reviewed in time?

**F7. Change of Stripe settings (Q25)**
- **Problem.** `losses.payments: "application"` was verified in sandbox. If the production account has a different value, reversal may fail (Q9).
- **Question.** Is verifying this configuration on the production account before launch a requirement?

---

## 6. Security and consistency risks (R)

**R1. Refund request authorization (IDOR)**
- **Problem.** The student submits a refund request from the course page. There is no requirement that one can submit only for one's own paid purchase, and that only an admin can approve, not an instructor (Q10 rules out the instructor).
- **Impact.** Other people's refund requests, refunds for other people's purchases.
- **Question.** Which roles can create, view, and close refund requests? What of them does the instructor see (Q23)?

**R2. Reliability of progress measurement (Q13 criterion 2)**
- **Problem.** The threshold blocks abuse only if progress cannot be understated or bypassed. A student can consume content in a way that progress is not recorded, and then the Q12(2) threshold does not reflect real consumption.
- **Question.** What counts as sufficient evidence of course use? Is it acceptable that the threshold can be bypassed?

**R3. Repeated abuse**
- **Problem.** Purchase-refund cycles, multiple accounts. Neither a limit nor monitoring is specified (V11).
- **Question.** Is a repeat refund considered a risk the feature has to do something about?

**R4. Multiple sources of truth about a refund (A5, Q4)**
- **Problem.** The state is spread across the refund request, the payment, the enrollment, the transfer, and the certificate, and a refund can be initiated by Learnix or by the Dashboard. Any divergence produces inconsistent states: "money refunded, but access remains", "refund request open, but money refunded", "transfer performed, although the payment was refunded".
- **Question.** What is the source of truth for the fact of a refund? Is regular reconciliation with Stripe needed?

**R5. Double refund**
- **Problem.** Two admins, a double click, a refund request plus the Dashboard (E3).
- **Question.** Is "no more than one refund per payment" an explicit requirement?

**R6. Personal data in the reason (V4, Q23)**
- **Problem.** The free text of the reason can contain personal data or insults. It is not defined whether the instructor sees it.
- **Question.** Who has access to the reason text? Is it moderated?

**R7. Admin accountability (V6)**
- **Problem.** Without an audit, an arbitrary approval or rejection cannot be verified. This is especially important because every refund is a direct loss for the platform (Q17).
- **Question.** Is an immutable decision history needed?

**R8. Trust and legal risk (Q15, Q24, Q20)**
- **Problem.** Until `/pricing` is updated (Q20 open), the site promises an unconditional refund, while the system applies the Q12 conditions. The risk was accepted deliberately, but it is not defined what the student sees on the course page when their purchase falls under the old promise (A7).
- **Question.** Should the update of the `/pricing` text be part of the same release?

**R9. Accounting for held funds (Q18, A6)**
- **Problem.** The instructor's held money physically sits on the platform balance. Without separate accounting it can be confused with platform revenue. The observation about `platformFeesCents` shows that the statistics are already inaccurate now.
- **Question.** Should the held share be separately visible to the platform and to the instructor?

---

## The 5 most important questions for the PO (by priority)

1. **The window boundary (S1, N2, N3, N5).** At what moment are the Q12 conditions checked, at submission or at the decision? Is the instructor's share held while there is an open refund request, even after the formal window closing? The answer determines whether Q18 really closes Q8/Q9.
2. **The manual path through the Dashboard (A5, S4, E3, E4, R4).** Does it remain, and if so, how does the system reconcile such refunds with refund requests, the certificate, and the held share? Without this, Q7 and Q8 cannot be considered closed.
3. **Q8 as a separate requirement and old purchases (S2, S3, F4).** Does the rule "no transfer for a refunded payment" apply independently of Q18? How to handle purchases made before launch, for which the transfer has already been performed or is sitting in `pending`?
4. **Who makes the decision and with what SLA (S6, A1, V2, F6).** What does the admin's decision add beyond the formal Q12 conditions, and what is the maximum review time? Q19 makes this time part of fairness for the student.
5. **Progress and the certificate as the boundary (N1, N4, Q13, R2, E5, E6).** Which exact event makes a refund impossible? How does the progress threshold behave in empty and changed courses and on a repeat purchase?
