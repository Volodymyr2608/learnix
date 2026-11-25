# AI response: Discovery questions (step 2b)

**Date:** 2026-11-04
**Model:** Claude (separate agent, no access to the code, the repo or the conversation)
**Context the AI had:** the prompt from the SDD guide (section "How to use AI here") + the
Problem section and the Q1–Q12 table from `../1-discovery.md`. The AI did not see my list 2a.
**Changes:** the prompt was adapted: instead of "ask questions one at a time" → "give the 5 most important at the end"
(non-interactive mode); "do not repeat Confirmed".

The text below is the AI response, translated into English; otherwise unedited.

---

## 1. Main business questions

1. **Which problem are we solving first?** There are three different problems:
   - the promise on the site cannot be kept (there is no channel to make a request);
   - the platform handles every refund manually;
   - there are financial holes: the certificate stays with the student, and the pending transfer is paid out to the instructor despite the refund.

   The scope of the first version depends on which of them is the main one. — Unknown
2. **Decision model [Q10]:** is the refund automatic (self-service), through a refund request with approval, or mixed? — Unknown
3. **Fairness policy [Q12]:** the promise is currently unconditional ("full refund", 30 days). Does the business want to restrict it (for example, by progress or certificate) or keep it unconditional? — Unknown
4. **Who bears the costs:** the instructor, the platform, or both? This concerns the platform fee, the Stripe fee, and the case where the instructor has already withdrawn the money [Q9]. — Unknown
5. **Does hypothesis [Q11] hold?** Is there a baseline purchase conversion and how do we measure the effect? What refund share is acceptable for the business? — Unknown
6. **Scale:** how many refunds happen now? There is no answer: there is no channel to make a request, so demand has not been measured. There may be history in the Stripe Dashboard — Unknown
7. **Refund reasons [Q1]:** do we need to collect them? Does the instructor see them? Do frequent refunds affect the course (moderation of "empty" courses)? — Unknown

## 2. User scenarios (candidates, not requirements)

| # | Actor | Scenario |
|---|---|---|
| S1 | Student | Bought a course, the course was not a fit, asks for a refund within 30 days |
| S2 | Student | Completed the course, got a certificate and asks for a refund (the abuse scenario from Problem) |
| S3 | Student | Asks for a refund after 30 days |
| S4 | Admin | Does a refund manually in the Stripe Dashboard (the current path [Q4]). Does it remain in parallel with the new one? |
| S5 | Admin | Reviews a refund request and approves or rejects it (only if the approval model is chosen) |
| S6 | Instructor | Learns that a sale was refunded and their share was deducted. Do they get a notification and the reason? — Unknown |
| S7 | Instructor | A refund when their transfer is still pending [Q8] |
| S8 | Instructor | A refund when they have already withdrawn the money [Q9] |
| S9 | Student | After a refund wants to buy the same course again |
| S10 | Student | Opened a chargeback with the bank instead of making a request on the platform (or together with the request) |

## 3. Potential edge cases

**Time and window**
- From what moment are the 30 days counted: payment, enrollment, or first access? Time zone? A refund request on day 30, but processing on day 31?
- The course was updated or its price changed after purchase.

**Money**
- A purchase with a discount or coupon. What does "full" mean then: the amount paid or the course price?
- Partial refund: is it possible at all? How does the current `charge.refunded` handler react to it? Won't it cancel the enrollment on a partial amount?
- The refund failed: the card is closed, Stripe declined, the refund is stuck in pending.
- The refund succeeded, but the transfer reversal did not (or vice versa). The money diverges between the parties.
- The instructor disconnected their Stripe account or the account was deactivated.
- The payment currency differs from the instructor payout currency — Unknown whether this is possible.
- Repeated request: a double click or two refund requests for one payment. The refund was already done manually, and the student submits a refund request.
- An open dispute or chargeback on the same payment.

**Access and artifacts**
- The certificate has already been issued [Q7]. If it is revoked, what happens to public links to it (if there are any, Unknown)?
- What to do with progress, reviews, messages to the instructor, participation in a learning path or bundle after a refund? — Unknown
- Repeat purchase after a refund and a second refund of the same course.
- The course was deleted or unpublished. The instructor was blocked.

**Abuse**
- Serial refunds by one user or through several accounts.
- The student downloaded or watched all the content in a few days.

**Purchase types**
- Free courses. Are there subscriptions or bundles that the guarantee also covers? — Unknown

## 4. Ambiguities in the requirements

1. **Promise versus policy.** An unconditional "full refund" [Q2] contradicts the wish to fight abuse [Q12]. If the conditions change, it is unclear what to do with those who bought under the old promise.
2. **"The admin refunds the money"** (section "Parties") versus **"the student cannot refund on their own"** (section "If nothing is done"). It is unclear whether self-service is the goal, or whether a working channel to make a request is enough.
3. **"The refund is fair."** There are no criteria: progress, certificate, time, reason [Q12].
4. **"Full."** Are the Stripe fee and the platform fee refunded, and who covers them?
5. **"The course is empty."** Is this a reason for a refund or a signal for course moderation? Does a refund have consequences for the instructor beyond losing money?
6. **The bug [Q8] and `/contact` [Q3].** Are these part of the Refund feature or separate fixes (trivial/fix)?
7. **Q1 and Q11 are assumptions without data.** Decisions cannot rest on them until they are confirmed.

## 5. Questions for the Product Owner / BA

### Business
- B1. Who makes the final decision about a refund: the system by rules, the admin, or the instructor? Does the instructor have a say? [Q10]
- B2. What criteria distinguish a fair refund from abuse: a progress threshold, a certificate received, the number of refunds per user? [Q12]
- B3. Can the guarantee text be changed? If so, what about purchases made under the old text?
- B4. Who covers the Stripe fee, and does the platform refund its fee?
- B5. How do we measure success: refund rate, purchase conversion, processing time? What is the current baseline? [Q11]
- B6. Are there legal requirements for refunds (student jurisdictions, right of withdrawal for digital content, taxes, refund documents)? — Unknown
- B7. Are refund reasons used (analytics, feedback to the instructor, course moderation)?

### User Flow
- U1. Where does the student initiate a refund and what do they see before, during and after it?
- U2. Is a reason mandatory? Free text or a list?
- U3. Does the student see that the course is no longer eligible for a refund (30 days have passed or the conditions were violated), and can they then reach a human?
- U4. Do the instructor and the admin get a notification? What is in it: amount, reason, student name?
- U5. Can a refund request be cancelled (if there is a refund request stage)?
- U6. Repeat purchase after a refund: allowed? Is the old progress kept?
- U7. What does the student see while the refund is still being processed?

### Payments
- P1. What happens to the reversal if the instructor has already withdrawn the funds? What type of Connect accounts is used and who is responsible for a negative balance? [Q9]
- P2. Are partial refunds supported? If so, what happens to access?
- P3. How should a pending transfer behave on a refund: be cancelled, be reduced? Is this fix within the feature scope? [Q8]
- P4. From what amount is "full" calculated with discounts or coupons?
- P5. Do manual refunds through the Stripe Dashboard remain an allowed path?
- P6. What to do with a payment that has an open dispute?

### Technical (questions, not decisions)
- T1. Does the current `charge.refunded` handler distinguish a full refund from a partial one? [Q4]
- T2. Is there currently progress and certificate data tied to a specific purchase (not just to the course)? — Unknown
- T3. What other parts of the system depend on the payment or enrollment status: instructor revenue analytics, reviews, learning paths, certificates? — Unknown
- T4. How many purchases are currently within the 30-day window (the risk volume at launch)? — Unknown

### Security
- SE1. Who can initiate a refund: only the buyer, the admin, the instructor? A check that the payment belongs to the user.
- SE2. Is an audit log needed: who, when, what amount was refunded and why?
- SE3. Are limits needed on the number of refunds per user or per period?
- SE4. Does the refund reason contain personal data, and who has the right to see it (the instructor)?
- SE5. Is confirmation of the action needed (re-authentication), since the action is financial and irreversible?

### Error Handling
- E1. What does the student see if Stripe is unavailable or declined the refund? Who finds out about it?
- E2. What to do if the refund went through but the reversal did not? Who resolves it and within what time?
- E3. What to do if the webhook is late? Does the student have access to the course in the gap between the request and the confirmation?
- E4. How to handle duplicates: a repeated request, a manual refund in parallel with an automatic one?
- E5. Does the admin need a queue or a notification about problematic refunds?

## 6. Missing information

- Data: the number and frequency of refunds now, purchase conversion, the number of courses, prices, the share of instructors with `payouts_enabled`.
- The refund policy in the form of concrete rules [Q10, Q12].
- Who is financially responsible for refunds and fees [Q9, B4].
- The type of Stripe Connect accounts and the negative-balance rules.
- Legal and tax requirements.
- A full list of the consequences of a refund for the certificate, progress, reviews, messages and bundles.
- Confirmation of Q1 and Q11 (currently these are assumptions).
- Scope boundaries: whether the fix [Q8] and the `/contact` page are part of the feature.

## The 5 most important clarifying questions

1. **Who decides on a refund and how [Q10]?** Automatically by rules (self-service), through a refund request with admin approval, or with the instructor's participation? The whole user flow, the roles, the notifications and the scope of the admin part depend on the answer.
2. **What are the refund conditions [Q12, B3]?** Does the guarantee stay unconditional ("full refund", 30 days), or are restrictions introduced (progress, certificate, a per-user limit)? What about those who already bought under the current promise?
3. **Who bears the financial losses [Q9, B4, P3]?** This is about the Stripe fee, the platform fee, the case where the instructor has already withdrawn the money, and the pending transfer. The answer determines whether a "full refund" can be guaranteed at all without losses for the platform.
4. **What are the consequences of a refund for the certificate and access [Q7, U6]?** Revoke the certificate? Allow a repeat purchase and a repeat refund? Without this, the main abuse risk from Problem remains.
5. **How exactly are the window and the amount defined [P2, P4]?** From what moment are the 30 days counted, is "full" the amount paid or the course price, and are there partial refunds? The eligibility rules and the behavior of the `charge.refunded` handler depend on this.
