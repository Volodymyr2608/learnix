# Plan: Authentication Completion (Account Suite)

Implementation order is bottom-up: config + email templates first (so flows have a backend), then the password-recovery pages (highest value — fixes the 404), then the settings hub section by section.

## Step 1 — Better Auth config (`server/better-auth/config.ts`)

Extend the existing `betterAuth({ ... })` call. Each verification email routes through `emailService.send` exactly like the existing `sendResetPassword` / `sendVerificationEmail` callbacks.

```ts
// inside betterAuth({ ... })
user: {
  additionalFields: { role: { type: "string", input: false } }, // existing
  changeEmail: {
    enabled: true,
    sendChangeEmailVerification: async ({ user, newEmail, url }) => {
      await emailService.send({
        templateKey: "auth.email-change",
        toEmail: user.email, // sent to the CURRENT email for security
        userId: user.id,
        payload: { name: user.name ?? user.email, newEmail, verifyUrl: url },
      });
    },
  },
  deleteUser: {
    enabled: true,
    sendDeleteAccountVerification: async ({ user, url }) => {
      await emailService.send({
        templateKey: "auth.account-deletion",
        toEmail: user.email,
        userId: user.id,
        payload: { name: user.name ?? user.email, confirmUrl: url },
      });
    },
  },
},
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ["github", "google"],
  },
},
```

`emailAndPassword.enabled` already powers `changePassword`. No extra config needed for `listSessions` / `revokeSession` / `listAccounts` / `linkSocial` / `unlinkAccount` — these are built-in.

## Step 2 — Email templates

1. Create `app/_emails/AuthEmailChangeEmail.tsx` and `app/_emails/AuthAccountDeletionEmail.tsx`, mirroring the structure of `app/_emails/AuthPasswordResetEmail.tsx`.
2. Register both in `server/services/email/email.templates.ts` with keys `auth.email-change` and `auth.account-deletion`, each with a Zod payload schema and **CRITICAL** criticality (so they bypass the notification opt-out).

## Step 3 — Forgot-password page (fixes the live 404)

1. `app/_components/Auth/ForgotPasswordForm/` — email field, `react-hook-form` + Zod, submit calls `authClient.forgetPassword({ email, redirectTo: "/reset-password" })`.
2. Always render a generic confirmation message (no enumeration).
3. `app/(auth)/forgot-password/page.tsx` renders it inside the existing `AuthFormLayout`.

## Step 4 — Reset-password page

1. `app/_components/Auth/ResetPasswordForm/` — read `token` from `useSearchParams`; new-password + confirm fields validated with `passwordSchema` + a match refinement (reuse the `signUpSchema` pattern in `server/entities/user/index.ts`).
2. Submit calls `authClient.resetPassword({ newPassword, token })`; on success `router.push("/sign-in?reset=true")`.
3. `app/(auth)/reset-password/page.tsx` renders it; handle missing/invalid token with an inline error linking back to `/forgot-password`.
4. In `SignInForm`, extend the existing `?verified=true` toast handling to also surface `?reset=true`.

## Step 5 — tRPC procedures (`server/api/routers/user.ts`)

Add to the existing `userRouter` (which currently only has `signUp`):

- `updateProfile` (`protectedProcedure`, input = `UserUpdateDto` subset: name, image) → updates the user via the user repository / service.
- `updateEmailPreferences` (`protectedProcedure`, input `{ emailNotificationsEnabled: boolean }`) → writes the field.

Keep password/email-change/session/account/deletion operations on `authClient` directly (they are Better Auth-managed and don't need a tRPC layer).

## Step 6 — Account settings hub (`app/dashboard/settings/page.tsx`)

Build under `app/_components/Account/` (ADR-011: one folder per section, colocated hooks), reusing `app/_components/_shared/components/Form/` primitives:

1. **ProfileSection** — name/image form → `api.user.updateProfile`.
2. **PasswordSection** — current + new + confirm → `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`.
3. **EmailSection** — new-email field → `authClient.changeEmail({ newEmail, callbackURL })`; show "check your current inbox to confirm".
4. **NotificationsSection** — toggle → `api.user.updateEmailPreferences`.
5. **ConnectedAccountsSection** — `authClient.listAccounts()`; link via `authClient.linkSocial({ provider })`; unlink via `authClient.unlinkAccount({ providerId })` (block unlinking the last credential).
6. **SessionsSection** — `authClient.listSessions()`; `revokeSession` per row; `revokeOtherSessions` button.
7. **DangerZoneSection** — `authClient.deleteUser(...)` behind a confirm dialog (password re-entry or email confirmation per FR5). On success, sign out and redirect home.

## Step 7 — Deletion data policy (FR5)

When wiring `deleteUser`, ensure instructor-owned courses are **soft-deleted** (the `Course` model already supports this) rather than orphaning enrolled students. Implement via a Better Auth `beforeDelete` hook or a small service call that soft-deletes the user's courses before account removal. Document the chosen behavior in code comments.

## Reuse summary

| Need | Reuse |
|------|-------|
| Auth client calls | `server/better-auth/client.ts` (`authClient`) |
| Password validation | `passwordSchema`, `signUpSchema` refinement — `server/entities/user/index.ts` |
| Email delivery | `emailService` — `server/services/email/email.service.ts` |
| Email template shape | `app/_emails/AuthPasswordResetEmail.tsx` |
| Notification opt-out check | already in `email.service.ts` (criticality bypass) |
| Form components | `app/_components/_shared/components/Form/` |
| Auth page layout | `app/_components/Auth/AuthFormLayout/` |