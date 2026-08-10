# Security requirements — account deletion and data retention

This document states **requirements and accepted risks**, not a description of what was built. It
covers the one section of the review brief this feature moves the needle on: `S13`, known limitations
and accepted risks. The other sections (`S1`–`S12`) are unaffected — this feature adds no AI surface,
no new external service, and no new input boundary.

Companion documents: [`spec.md`](./spec.md) (functional design) and ADR
[025](../../../adr/025-account-deletion-and-anonymisation.md) (anonymise-in-place, the two-hook
interception, and the `Cascade → Restrict` downgrades).

---

## S13. Known limitations and accepted risks

Written as facts after implementation, not as intentions before it. An independent security audit of
the branch enumerated what survives anonymisation; this section records the residual risk that was
accepted and why.

### The shape of the residual risk

Anonymisation strips the `User` row of identifying fields (`name` → `Deleted user`, `email` →
`deleted-<randomUUID>@system.invalid`, `image` → `null`) and destroys credentials and privately
authored content. It does **not** reach free text the person wrote inside relations that are retained
on purpose, because those rows also belong to someone else. Article 17 gives a person the right to
erase *their* data, not their counterparty's.

So the honest statement of this feature's guarantee is: **the account becomes unusable and
unattributable by display, but text the person wrote in shared contexts survives.**

**Accepted by design**

1. **`CourseReview.comment` survives and stays public.** (`review.prisma:22`) On the course page, to
   any visitor, indefinitely, attributed to "Deleted user". This is the sharpest item in the set:
   reviewers commonly self-disclose in free text ("as a career-changer at 45…", employer, location),
   and on a niche course a comment plus its timestamp can re-identify its author to someone who
   already knows the cohort. Accepted because destroying reviews silently moves the course's average
   rating — altering a product other people are still buying and other reviewers contributed to.
2. **`Message.body` survives, readable by the counterparty.** (`message.prisma:33`) Bounded to the
   one person who was already in the conversation and already knew who they were talking to, which
   is why this ranks below the reviews. Accepted because both parties have equal claim to a thread;
   one party leaving should not delete the other party's correspondence.
3. **`Course` and `Lesson` copy survives, in full.** Titles, descriptions, objectives, requirements
   and lesson content are the instructor's own authored work, retained so students who paid keep the
   thing they paid for. Lowest risk of the set — it is a product, not a self-description — but it is
   still prose that can carry a recognisable voice.
4. **`InstructorProfile.stripeAccountId` survives indefinitely, with no settle-and-clear path.**
   (`instructor.prisma:12`) Displayed to nobody, but it points at a Stripe Connect account holding
   the person's legal name, date of birth and bank details. It is retained because the payout sweep
   resolves an instructor's account through exactly this row
   (`server/services/payments/connect.service.ts:119-128`); destroying it strands every transfer
   already owed to them — the failure the feature exists to prevent. **This is the one accepted risk
   with a named follow-up** (below), because the justification expires: once nothing is owed, the
   pointer is pure liability.
5. **The anonymised row remains linkable by `User.id`.** The id is unchanged and is still a foreign
   key on payments, enrollments, reviews, messages and progress. Anyone who recorded it before
   deletion — a counterparty can read it straight out of `Message.senderId`
   (`server/services/messaging/messaging.service.ts:102`) — keeps a stable handle to correlate those
   rows. The placeholder email no longer leaks it (see below), but the id itself is load-bearing and
   cannot be rotated without breaking every retained relation.

### Closed during review

**The placeholder address was a denial-of-service on the right to erasure.** It was originally
derived as `deleted-<userId>@system.invalid`. Because `Message.senderId` hands a counterparty the
victim's raw `userId`, and `users.email` is unique, anyone who had ever been messaged by the victim
could register an ordinary account at that exact address and make the victim's deletion fail forever
on the final `UPDATE` — with no self-service recovery and no signal that it had happened. The address
is now `deleted-<randomUUID>@system.invalid`, removing the pre-image.
Regression test: `server/repositories/user.repository.integration.test.ts` — "cannot be blocked by
someone squatting a predictable placeholder address".

**`pnpm reindex` used to undo part of the erasure.** Anonymised accounts keep their enrollments, so
they matched the backfill's population filter and had their interest embedding rebuilt on the next
run. `NOT_ANONYMISED` now excludes them (`scripts/reindex-embeddings.ts`). Erasure that a maintenance
script reverses is not erasure.

**Pending recovery tokens outlived the account.** `Verification` rows keyed to the user are now
destroyed inside the same transaction as `Session` and `Account`; a live password-reset token is a
credential.

### Cleared by the audit — do not re-derive

**No auth-bypass or resurrection path exists.** Every `Account` row (including `credential`) and
every `Session` is destroyed in the transaction, so no password hash or OAuth link survives. OAuth
auto-linking requires the provider to report a *verified* email matching the row, which no provider
can ever do for `.invalid`. Password reset cannot deliver either. **The `.invalid` TLD is
load-bearing** (RFC 2606, guaranteed unroutable): better-auth's reset flow creates a fresh credential
account for any address that can actually receive mail, so moving the placeholder to a domain we own
would open exactly the resurrection path this closes.

**No IDOR on the deletion endpoint.** Neither `/delete-user` nor its callback accepts a
caller-supplied user id; both operate on `session.user.id`, and the emailed token is checked against
that same id. One user cannot trigger anonymisation of another's account.

**Note on the second factor.** The real gate on the state-changing step is *possession of the
registered mailbox*, not password re-entry. Better Auth only verifies the password when the request
body carries one, and the UI always sends it — but the server does not require it once
`sendDeleteAccountVerification` is configured. Correct the mental model before relying on "password
re-verification" as a control.

**The veto hook has exactly one caller today.** `databaseHooks.user.delete.before` returns `false`
unconditionally, and `internalAdapter.deleteUser` is the only path in better-auth 1.5.4 that deletes
a `user` row; no admin plugin is registered. Nothing is left inconsistent by the silent skip today.
The forward-looking hazard is that it *is* silent: `deleteWithHooks` treats `=== false` as "skip and
return null", so a future admin panel calling `auth.api.removeUser` would appear to succeed while
deleting nothing.

### Follow-up items

1. **Settle-and-clear sweep for `stripeAccountId`.** Null it on `InstructorProfile` once no
   `transferStatus: pending` payment remains for that instructor. This is the one item that converts
   an accepted risk into a closed one, and it is the highest-value follow-up here.
2. **If an admin panel is ever added**, make the veto distinguish end-user deletion from
   admin-initiated deletion, or make it throw, so the no-op cannot pass for success.
3. **Re-verify the veto on every `better-auth` upgrade.** Returning `false` from
   `databaseHooks.user.delete.before` is load-bearing and undocumented behaviour of a specific
   version; see ADR-025's upgrade checklist.
4. **Consider letting users delete their own reviews before closing the account.** It is the only
   mitigation that addresses item 1 in the accepted-risk list without destroying third-party data.