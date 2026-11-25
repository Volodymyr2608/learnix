# Security design pass (security-auditor, design mode), 2026-11-16

*Raw output of the `security-auditor` agent, dispatched at the end of the Functional requirements
draft (spec commit `89581d9`). Kept as evidence, not design: what is accepted lands in `spec.md`
and `3-alternatives.md`. Spot-checked by the main session: `paidAt` is indeed absent from `Payment`
(the schema file is `prisma/schema/payments.prisma`, not `payment.prisma` as the report says); the
webhook dedup is indeed check-then-record (`app/api/stripe/webhook/route.ts:44`, `:85`).*

---

**Mode:** design. No edits. Read in full: `spec.md`, ADR-037, ADR-019, `payment.service.ts`,
`connect.service.ts`, `app/api/stripe/webhook/route.ts`, `server/api/routers/payment.ts`,
`server/api/trpc.ts`, `app/api/certificates/[enrollmentId]/route.ts`, `app/api/uploads/route.ts`,
`server/services/vercel/vercel.service.ts`, `server/services/notifications/auth.ts`,
`certificate.service.ts`, the Payment schema, `3-alternatives.md` §D2–§OQ-2. Sampled: `messaging.service.ts:100-154`,
`review.service.ts`, `lesson.service.ts:113-225`, `app/api/chat/lesson/route.ts`, `user.repository.ts`
anonymise, the email renderer, `@vercel/blob` typings.

LLM surfaces → `llm-security-auditor`: the lesson tutor as a content channel that bypasses the
opened-lesson signal (T9).

## 1. Threats kept

| # | STRIDE | Threat | Surface / file | L×I | Control |
|---|---|---|---|---|---|
| T1 | E/I | IDOR: request/appeal/status for another student's payment | new `refund.*` procedures | M×H | `studentProcedure`; input `courseId` only; payment resolved with `studentId: ctx.session.user.id, courseId, status: "succeeded"` in the authorizing query; later steps use that row (ADR-023). Other student's course → `NOT_FOUND` |
| T2 | T | Client chooses refund amount/currency/target | `refunds.create` | L×H | `refunds.create({ payment_intent: row.stripePaymentIntentId }, { idempotencyKey })`, no `amount`; `.strict()` input with no money fields |
| T3 | T | Double submit / two tabs → two requests or two `refunds.create` | request procedure | H×M | `@@unique([paymentId])` on `RefundRequest` and `RefundAppeal`; key `refund:{paymentId}`; `charge_already_refunded` → "already refunded, reconcile", not a failure |
| T4 | T | Race on the account limit: 5 parallel requests all see "2 refunds" | request procedure | M×M | Count + insert in `approved_processing` in one transaction after `SELECT … FOR UPDATE` on the `User` row (or advisory lock); no network call inside; count includes `approved_processing` |
| T5 | T | Refund-vs-release race at the window edge | cron + request | L×H | Release claim is one conditional `UPDATE` with the full predicate; 1 h grace margin; ADR-037 reversal fallback |
| T6 | T | **Release while an appeal right is still open, or a refund is processing/failed.** After an automatic denial nothing is "open" during the 3-day grace, so the cron releases | ADR-037 §1, cron | M×H | Predicate also excludes (i) a denied request whose appeal deadline has not passed and has no appeal, (ii) requests in `approved_processing` / `refund_failed` |
| T7 | T | Transfer twice after a crash: Stripe prunes idempotency keys after ~24 h; the daily cron retries ~23–25 h later | ADR-037 §2 | M×H | `transfer_group: payment.id` + `metadata.paymentId`; recovery lists `transfers.list({ transfer_group })` first; same for refunds and reversals |
| T8 | T | Duplicate effects: webhook + replay concurrently; dedup is check-then-record (`route.ts:44`, `:85`) | shared event handler | H×M | All effects gated by one CAS `UPDATE … SET status='refunded' WHERE id=? AND status='succeeded'`; DB effects in that transaction; Stripe calls keyed + list-before-retry |
| T9 | S/T | Gaming the threshold: (a) fail-open opened-record write (`lesson.service.ts:154-158` pattern); (b) tutor route loads lesson without "opening" it (`app/api/chat/lesson/route.ts:45-90`); (c) other surfaces unenumerated | FR-P19 | M×M | Opened record written server-side before returning lesson body, fail-closed; every surface returning lesson content records an open; tutor half → `llm-security-auditor` |
| T10 | E | Multi-account sampler: limit keyed on `userId` | OQ-2 | M×L | **Decision:** also count per card fingerprint, or accept loss = Stripe fee × N |
| T11 | E | Overdue auto-approve becomes an unlimited bypass: flood direct appeals, day 14 approves | FR-A5 | M×M | **Decision:** auto-approve only post-A1′ appeals; direct appeals escalate; or overdue approvals count toward the limit; recheck dispute/refunded state at execution |
| T12 | T | Refund of a disputed charge | all refund paths | L×H | Live `charges.retrieve` before every `refunds.create`; stored `disputeStatus` from `charge.dispute.created/closed` + replay drives the button; no Stripe call per page view |
| T13 | T | Double charge race: both or neither refunded; a duplicate with a failed refund released to the instructor | `finalizeCheckout` | L×M | Lock the `(studentId, courseId)` enrollment row; keeper = earliest `paidAt`; duplicate written `transferStatus='cancelled'` before `refunds.create` |
| T14 | T | Early payout paths survive (`payment.service.ts:123-125`, `:162`; `sweepAllPendingTransfers`) | existing code | H×H | `transferToInstructor` callable only via the single release function; `sweepAllPendingTransfers` deleted |
| T15 | S | Cron route called by anyone / weak secret | cron route | M×H | `timingSafeEqual` (pattern in `notifications/auth.ts:8-17`); `CRON_SECRET: z.string().min(32)`; 401 empty body; counts only in response |
| T16 | D/T | Overlapping runs | cron service | M×L | Redis `SET NX EX 330`, compare-del release; Run job now calls the service, never the URL |
| T17 | E | Admin actions reachable by others | admin router | L×H | `adminProcedure`; `z.cuid()` ids; exception reason `min(10).max(2000)`; Retry has no force flag |
| T18 | R | Audit editable/deletable via `BaseRepository` | FR-A3 | L×M | Append-only `RefundAuditEvent`; repository without update/delete; Postgres trigger raising on UPDATE/DELETE; `onDelete: Restrict` |
| T19 | I | Instructor learns of a request/appeal/reason | instructor queries, emails | M×M | Explicit `select`, no joins to refund tables; held amounts from `Payment` only; no instructor email references refund data |
| T20 | I/E | Evidence file IDOR or public exposure (`vercel.service.ts:17-19` uses `access: "public"`) | upload/serve | M×H | Private files, authorizing route, 404 to anyone but the payment's student or ADMIN |
| T21 | T/E | Malicious file (SVG/HTML, polyglot, oversized) | uploads | M×M | Magic-byte allowlist, attachment + `nosniff` + sandbox CSP, caps |
| T22 | T | Stored XSS via reason/appeal/denial text/filename | admin queue, student status, emails | L×M | React text nodes only; caps (reason 1000, appeal 4000, denial 4000, filename 255); reminder emails carry no student text |
| T23 | I | Stripe/Prisma details leak to the student | errors | M×L | Typed `RefundError` codes; raw Stripe message only on the admin problem-payment record |
| T24 | E | Feature flag enforced only in the UI | FR-P20 | M×M | Server-side flag check → `NOT_FOUND` |
| T25 | E | Revoked certificate still served via 30-day tokens | certificate route | M×L | `renderPdf` and `listEarned` reject `certificateRevokedAt != null` |
| T26 | E | Messaging not actually closed (`messaging.service.ts:119-124`, `:141-151`) | FR-P11 | H×L | `send` rejects `closedAt != null` for both roles; check new-conversation gating (unverified) |
| T27 | T | Instructor deletes lessons to lower L, or deletes the course (L=0) | FR-S2/S5 | L×L | Snapshot stores L, opened count and lesson ids. **Decision** on a course deleted by its instructor |
| T28 | T | `getSessionStatus` finalizes any `sessionId` unbound (`payment.ts:33-41`), now with a refund side effect | existing | L×L | Bind finalize to `ctx.session.user.id` from the router |
| T29 | I | Account deletion (ADR-025) leaves appeal text/files | `anonymiseAccount` | M×M | Blank free text and filenames, delete blobs, keep numbers and audit |

## 2. Controls → acceptance criteria

(Condensed; each line is a proposed testable AC.)

- T1: B calling `refund.*` with A's `courseId` → `NOT_FOUND`, no row, no Stripe call.
- T2: `refunds.create` mock called with exactly `{ payment_intent }`, no `amount`; extra keys rejected.
- T3: two concurrent requests → one row (second `CONFLICT`), one `refunds.create` with key `refund:{paymentId}`; `charge_already_refunded` → `refunded`.
- T4: 2 counting refunds + 3 concurrent requests → exactly 1 auto-approved, 2 routed to appeal.
- T5: release claim is one conditional `UPDATE`; `paidAt` at 14 d − 1 s or 14 d + 30 min not claimed; a request committed between claim and transfer → one reversal.
- T6 (new FR-P2a): a denied request with a future appeal deadline, or a request in `approved_processing`/`refund_failed`, blocks release on every path.
- T7: `transfers.create` with `transfer_group = payment.id`, key `transfer:{paymentId}`; recovery with an existing transfer marks `transferred` without a new call; same for refunds.
- T8: same `charge.refunded` event concurrently via webhook and replay → effects once (counts asserted).
- T9: fetching a lesson via `getStudentLesson` or `POST /api/chat/lesson` creates an opened record; a failed write returns no body.
- T12 (new FR-P18a): `disputed: true` → no `refunds.create` on any path; dispute webhooks set/clear `disputeStatus`; zero Stripe calls on page render.
- T13: two concurrent finalizes → one `succeeded`, one refunded that never was `pending`.
- T14: `sweepAllPendingTransfers` gone; `finalizeCheckout` makes no transfer; contract test: `transfers.create` in exactly one function.
- T15 (new FR-P3a): cron route without/wrong/different-length secret → 401, empty body, no writes; `CRON_SECRET` < 32 chars rejected; 200 body has no payment ids.
- T16: with the lock held, Run job now → `already_running`; a foreign lock is not deleted.
- T17: every admin refund/payouts procedure is `adminProcedure`; others get `FORBIDDEN`; deny/exception without reason fails Zod.
- T18: UPDATE/DELETE on `refund_audit_events` raises; one event per approve/deny/overdue/exception.
- T19: no instructor procedure output contains refund-table fields; revenue responses identical with/without an open appeal apart from the held amount; no instructor email on request/appeal/refund.
- T22: `<img src=x onerror=alert(1)>` renders as text; over-cap inputs fail Zod; reminder emails carry no reason text.
- T23: Stripe error → fixed `PROCESSING` copy for the student; raw message only on the admin row.
- T24: flag off → `NOT_FOUND` on direct calls.
- T25: revoked certificate → 404 with a valid token; omitted from the list.
- T26: `message.send` to a closed conversation → `FORBIDDEN` for both; history readable.
- T28: `getSessionStatus` with another student's session → `not_found`.
- T29 (new FR-P22): after `anonymiseAccount`, refund free text and filenames null, blobs deleted, numbers and audit kept.

## 3. FR-S15 proposal

- **Types:** PNG, JPEG, PDF only; declared type and magic bytes must agree, else 415.
- **Caps:** ≤ 3 files per appeal and per admin denial; ≤ 4 MB per file and ≤ 4 MB total per request
  (Vercel body limit 4.5 MB, from memory).
- **Upload:** one multipart Route Handler `POST /api/refunds/appeal` with text and files; order:
  session → role → flag → `safeParse` → ownership-bound lookup → deadline → type/size → upload →
  insert. Client uploads with a bound token only if 4 MB proves too small.
- **Storage:** Vercel Blob `access: "private"` (supported by `@vercel/blob ^2.3.1`; whether the
  store must be created private is unverified); server-generated pathname; do not reuse
  `VercelService.uploadFileToVercelStorage` (public, user extension); `RefundFile` row never
  returns a URL.
- **Serving:** `GET /api/refunds/files/[fileId]`; served iff the payment's student or ADMIN, else
  404; `attachment`, fixed filename, `nosniff`, `sandbox` CSP, `no-store`; inline preview for
  PNG/JPEG to the admin only.
- **Retention:** decision (proposal: 90 days after the decision) + deletion on anonymisation.
- **Rule conflict:** ADR-017 Rule 4 allows uploads to INSTRUCTOR/ADMIN only; needs an amendment.

## 4. Accepted / out of scope

Malware scanning; EXIF in student photos; stolen-card buy-then-refund (refund returns to the card);
chargeback after release (platform bears it, D-6); instructor alt-account self-purchase; "on hold
past day 14 means an appeal" inference (already accepted); CSRF on admin mutations; per-process rate
limits; a compromised admin mass-refunding (trusted by design, audit detects); partial Dashboard
refund then dispute for the full amount.

## 5. Wrong or missing in spec / ADR-037

1. The release predicate misses the appeal grace and failed refunds (ADR-037:48-49 vs FR-S16, Branch C) → T6.
2. "Retry with the same key is safe" expires with Stripe key pruning (~24 h) → T7.
3. ADR-017 Rule 4 vs FR-S15 → amend ADR-017.
4. The dedup is check-then-record, so the payment-status CAS must be the documented gate (T8).
5. `paidAt` does not exist on `Payment` → define it, set in `finalizeCheckout`.
6. No dispute data source: the webhook handles three event types → add dispute events + replay (FR-P18a).
7. OQ-5 overdue auto-approve neutralises OQ-2 and the threshold when the admin is absent → T11.
8. FR-P19 under-specified: content surfaces not named, fail-open template → T9.
9. Missing FRs: account deletion (T29), audit immutability mechanism, server-side flag, cron auth and secret length, removal of `sweepAllPendingTransfers` and the `finalizeCheckout` retry path.
10. D2 says cleanup happens on the webhook; FR-P14 supersedes it → mark D2 superseded.

## Decisions needed

- T10: count per card fingerprint as well?
- T11: overdue auto-approve for direct appeals, only post-A1′, or count toward the limit?
- T27: course deleted by the instructor inside the window → automatic refund, or normal rules with L from the snapshot?
- FR-S15: 4 MB total in one request vs client-upload tokens; evidence retention period.
- FR-S15 storage: confirm Vercel Blob private support, else a dedicated store or Postgres `bytea`.

## Unverified in this pass

Whether `lessonAssistant` / `lessonInsightsAI` / search return lesson body to students; whether a new
conversation requires an active enrollment; the Stripe refund-failure event name; the Vercel 4.5 MB
body limit and Stripe 24 h key pruning (from memory); Vercel Blob private-store requirements.
