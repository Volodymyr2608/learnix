# Validation: Authentication Completion (Account Suite)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:integration` — new integration tests for `user.updateProfile` and `user.updateEmailPreferences` against `learnix_test` (assert DB rows update and `protectedProcedure` rejects anonymous callers).

Most account operations are Better Auth-managed and don't warrant new integration tests; cover only the two new tRPC procedures.

## Manual scenarios

### S1 — Forgot password (fixes the 404)
1. From `/sign-in`, click **Forgot password?**.
2. **Verify:** lands on `/forgot-password` (no 404).
3. Submit a registered email.
4. **Verify:** generic confirmation shown; reset email received.
5. Submit an **unregistered** email.
6. **Verify:** identical generic confirmation (no account enumeration).

### S2 — Reset password
1. Open the reset link from the email → `/reset-password?token=...`.
2. Submit a new password (confirm-match enforced; `passwordSchema` rules enforced).
3. **Verify:** redirected to `/sign-in?reset=true` with a success toast; can sign in with the new password; old password rejected.
4. Open `/reset-password` with a missing/expired token.
5. **Verify:** inline error with a link back to `/forgot-password`.

### S3 — Change password
1. In settings → Password, submit wrong current password.
2. **Verify:** rejected.
3. Submit correct current + valid new password.
4. **Verify:** success; other sessions revoked (if `revokeOtherSessions` enabled); next sign-in requires the new password.

### S4 — Change email
1. In settings → Email, request a change to a new address.
2. **Verify:** verification email sent to the **current** address; email unchanged until confirmed.
3. Click the confirmation link.
4. **Verify:** `User.email` updated; sign-in works with the new email.

### S5 — Notification preference honored
1. Toggle email notifications **off**.
2. Trigger a non-critical lifecycle email (e.g. near-completion).
3. **Verify:** it is suppressed.
4. Trigger a critical auth email (password reset).
5. **Verify:** it still sends despite the toggle.

### S6 — Connected accounts
1. In settings → Connected accounts, link Google.
2. **Verify:** a second `Account` row exists for the user; can sign in via either provider.
3. Unlink Google.
4. **Verify:** row removed; unlinking the **last** credential is blocked.

### S7 — Sessions / devices
1. Sign in from a second browser/device.
2. In settings → Sessions, **verify** both sessions are listed.
3. Revoke the other session.
4. **Verify:** the other browser is signed out on its next request; "revoke all others" clears every session except the current one.

### S8 — Account deletion
1. In Danger zone, request deletion; complete the required confirmation (password and/or email link per FR5).
2. **Verify:** user is signed out and redirected home; session/account rows removed.
3. **Verify (instructor):** the deleted instructor's courses are **soft-deleted**, not hard-deleted; previously enrolled students retain integrity per the documented policy.

## Security checks (ADR-017)

- Forgot-password responses are identical for existing vs. non-existing emails (S1).
- Password change requires the current password (S3).
- Email change confirmation goes to the current address, not the new one (S4).
- Account deletion requires a fresh confirmation (S8).
- All new tRPC procedures reject anonymous callers with `UNAUTHORIZED`.