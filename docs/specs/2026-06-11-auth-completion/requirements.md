# Requirements: Authentication Completion (Account Suite)

## Overview

The base authentication feature ([`2026-05-04-auth`](../2026-05-04-auth/requirements.md)) shipped sign-up, sign-in, OAuth, roles, and guards. Better Auth also already handles **password reset** and **email verification** server-side (`server/better-auth/config.ts`). However, the user-facing surfaces are incomplete:

- The sign-in form links to `/forgot-password` (`app/_components/Auth/SignInForm/index.tsx:57`), but **no page exists there — the link 404s.** There is no reset-password page either.
- There is **no account-settings surface at all**: no change password, email change, email-notification preference toggle, connected-accounts management, session/device management, or account deletion.

This spec closes the full account-management suite so users can self-serve every common account operation.

## Goal

Every authenticated user can, without admin intervention: recover a forgotten password, change their password, change their email (with verification), update their profile, control email notifications, link/unlink social accounts, view and revoke sessions, and delete their account.

## Functional requirements

### FR1 — Forgot password
- New page `app/(auth)/forgot-password/page.tsx`: a single email field.
- Submitting calls `authClient.forgetPassword({ email, redirectTo: "/reset-password" })`.
- Always show a generic "if an account exists, you'll receive an email" message (no account enumeration — ADR-017).
- The existing `auth.password-reset` template + `sendResetPassword` callback already deliver the email.

### FR2 — Reset password
- New page `app/(auth)/reset-password/page.tsx`: reads `token` from the query string; new-password + confirm-password fields.
- Validate with `passwordSchema` (`server/entities/user/index.ts`); confirm-match check (reuse the `signUpSchema` refinement pattern).
- Submitting calls `authClient.resetPassword({ newPassword, token })`; on success redirect to `/sign-in` with a success toast (mirror the `?verified=true` pattern already in `SignInForm`).
- Invalid/expired token → inline error with a link back to `/forgot-password`.

### FR3 — Account settings hub
A new authenticated page at `app/dashboard/settings/page.tsx`, organized into tabbed sections:

| Section | Capability | Mechanism |
|---------|-----------|-----------|
| Profile | Update name and image | `user.updateProfile` tRPC mutation (reuse `UserUpdateDto`) or `authClient.updateUser` |
| Password | Change password (requires current password) | `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })` |
| Email | Change email with verification | `authClient.changeEmail` — needs `changeEmail` enabled + a verification email |
| Notifications | Toggle marketing/lifecycle emails | `user.updateEmailPreferences` writing `User.emailNotificationsEnabled` |
| Connected accounts | List / link / unlink GitHub & Google | `authClient.listAccounts` / `linkSocial` / `unlinkAccount` |
| Sessions | List active sessions; revoke one or all others | `authClient.listSessions` / `revokeSession` / `revokeOtherSessions` |
| Danger zone | Delete account | `authClient.deleteUser` — needs `deleteUser` enabled with confirmation |

### FR4 — Email notification preference is honored
- The toggle writes `User.emailNotificationsEnabled`, which `server/services/email/email.service.ts` already consults.
- **Critical** emails (auth: verify, reset, change-email, deletion confirmation) must still send even when the toggle is off; only non-critical lifecycle/marketing emails are suppressed. Confirm the existing criticality check covers this.

### FR5 — Account deletion policy
Define and document what happens to user-owned data on deletion:
- **Students:** sessions and accounts removed; enrollments/progress anonymized or removed per policy.
- **Instructors:** courses are **soft-deleted** (the `Course` model already supports soft-delete) rather than hard-deleted, to preserve enrolled students' access integrity; document this explicitly.
- Deletion requires confirmation (password re-entry and/or an email confirmation link via `sendDeleteAccountVerification`).

## Non-functional requirements / constraints

- **Security (ADR-017 / OWASP):** no account enumeration on forgot-password; rate-limit reset and email-change requests; require current password for password change; require fresh confirmation for email change and account deletion.
- **Role enforcement** stays at the tRPC procedure layer (ADR-004); new tRPC procedures use `protectedProcedure`.
- **Component structure** follows ADR-011 (one folder per component, colocated hooks).
- Reuse existing form primitives and the established `react-hook-form` + Zod pattern.

## Data models

No schema changes required — all needed fields already exist:
- `User.emailNotificationsEnabled` (notification toggle), `User.email` / `name` / `image` (profile).
- `Account` (`@@unique([userId, providerId])` already supports multiple linked providers).
- `Session` (Better Auth-managed; session list/revoke uses these rows).
- `Verification` (Better Auth-managed; reused for email-change and deletion tokens).

## Environment variables

No new variables required. Email change and deletion confirmations route through the existing Resend service (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`).

## File list

**New:**
- `app/(auth)/forgot-password/page.tsx` (+ component folder under `app/_components/Auth/ForgotPasswordForm/`)
- `app/(auth)/reset-password/page.tsx` (+ `app/_components/Auth/ResetPasswordForm/`)
- `app/dashboard/settings/page.tsx` (+ `app/_components/Account/` with one folder per section)
- `app/_emails/AuthEmailChangeEmail.tsx`, `app/_emails/AuthAccountDeletionEmail.tsx`

**Modified:**
- `server/better-auth/config.ts` — add `changeEmail`, `deleteUser`, `account.accountLinking` config
- `server/services/email/email.templates.ts` — register the two new templates
- `server/api/routers/user.ts` — add `updateProfile`, `updateEmailPreferences`
- `server/entities/user/index.ts` — DTOs for the new procedures if needed (reuse `UserUpdateDto`)