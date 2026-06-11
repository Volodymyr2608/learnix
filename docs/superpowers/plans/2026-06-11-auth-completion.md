# Auth Completion (Account Suite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the auth surface so every authenticated user can self-serve: recover a forgotten password, manage their profile/password/email, control notifications, link/unlink social accounts, manage sessions, and delete their account.

**Architecture:** Backend-first (Better Auth config + email templates first so flows have a server), then the 404 fix (forgot/reset password pages), then tRPC procedures for profile/notifications, finally the account settings hub with tabbed sections. All account operations except `updateProfile` and `updateEmailPreferences` go through `authClient` directly.

**Tech Stack:** Next.js 15 App Router, Better Auth 1.5, tRPC, Prisma, react-hook-form + Zod, Radix UI, Tailwind, sonner (toast), @radix-ui/react-switch (new).

---

## Design note: section layout

Every account settings section is wrapped in the existing `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` primitives from `app/_components/_shared/ui/card.tsx`. **Do not** use bare `<section>` + `<div>` for the header. Pattern:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Section title</CardTitle>
    <CardDescription>Helper text.</CardDescription>
  </CardHeader>
  <CardContent>
    {/* form or interactive content */}
  </CardContent>
</Card>
```

The code blocks in Tasks 7–10 below show this pattern correctly.

---

## File Map

**New files:**
- `app/_components/_shared/ui/switch.tsx` — Radix Switch primitive
- `app/_emails/AuthEmailChangeEmail.tsx`
- `app/_emails/AuthAccountDeletionEmail.tsx`
- `app/(auth)/forgot-password/page.tsx`
- `app/_components/Auth/ForgotPasswordForm/index.tsx`
- `app/_components/Auth/ForgotPasswordForm/hooks/useForgotPassword.ts`
- `app/(auth)/reset-password/page.tsx`
- `app/_components/Auth/ResetPasswordForm/index.tsx`
- `app/_components/Auth/ResetPasswordForm/hooks/useResetPassword.ts`
- `server/api/routers/user.integration.test.ts`
- `app/dashboard/settings/page.tsx`
- `app/_components/Account/ProfileSection/index.tsx`
- `app/_components/Account/ProfileSection/hooks/useProfileForm.ts`
- `app/_components/Account/PasswordSection/index.tsx`
- `app/_components/Account/PasswordSection/hooks/usePasswordForm.ts`
- `app/_components/Account/EmailSection/index.tsx`
- `app/_components/Account/EmailSection/hooks/useEmailForm.ts`
- `app/_components/Account/NotificationsSection/index.tsx`
- `app/_components/Account/NotificationsSection/hooks/useNotificationsToggle.ts`
- `app/_components/Account/ConnectedAccountsSection/index.tsx`
- `app/_components/Account/SessionsSection/index.tsx`
- `app/_components/Account/DangerZoneSection/index.tsx`
- `app/_components/Account/DangerZoneSection/hooks/useDangerZone.ts`
- `app/_components/Account/SettingsShell/index.tsx`

**Modified files:**
- `server/services/email/email.templates.ts` — register 2 new templates
- `server/better-auth/config.ts` — add changeEmail, deleteUser, accountLinking
- `server/api/routers/user.ts` — add updateProfile, updateEmailPreferences
- `server/entities/user/index.ts` — add ProfileUpdateSchema, EmailPreferencesSchema
- `app/_components/Auth/SignInForm/index.tsx` — add `?reset=true` toast

---

## Task 1: Switch UI component

Add `@radix-ui/react-switch` and create the shared `Switch` component following the existing Radix-wrapper pattern.

**Files:**
- Create: `app/_components/_shared/ui/switch.tsx`

- [ ] **Step 1: Install the package**

```bash
cd /path/to/learnix && pnpm add @radix-ui/react-switch
```

Expected: resolves and `@radix-ui/react-switch` appears in `node_modules/@radix-ui/`.

- [ ] **Step 2: Create `app/_components/_shared/ui/switch.tsx`**

```tsx
"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type * as React from "react";

import { cn } from "@/lib/utils/cn";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | head -20
```

Expected: no errors related to `switch.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/_components/_shared/ui/switch.tsx
git commit -m "feat: add Switch UI component (Radix)"
```

---

## Task 2: Email templates — email-change and account-deletion

Mirror `AuthPasswordResetEmail.tsx`. Register both with `CRITICAL` criticality so they bypass the notification opt-out.

**Files:**
- Create: `app/_emails/AuthEmailChangeEmail.tsx`
- Create: `app/_emails/AuthAccountDeletionEmail.tsx`
- Modify: `server/services/email/email.templates.ts`

- [ ] **Step 1: Create `app/_emails/AuthEmailChangeEmail.tsx`**

```tsx
import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
  name: string;
  newEmail: string;
  verifyUrl: string;
};

export function AuthEmailChangeEmail({ name, newEmail, verifyUrl }: Props) {
  return (
    <EmailLayout>
      <Heading style={{ fontSize: 24, color: "#111827" }}>
        Confirm your email change
      </Heading>
      <Text style={{ color: "#374151", fontSize: 15 }}>
        Hi {name}, we received a request to change your Learnix email address
        to <strong>{newEmail}</strong>. Click the button below to confirm this
        change.
      </Text>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <EmailButton href={verifyUrl}>Confirm Email Change</EmailButton>
      </Section>
      <Text style={{ color: "#6b7280", fontSize: 13 }}>
        If you didn't request this change, you can safely ignore this email.
        This link expires in 24 hours.
      </Text>
    </EmailLayout>
  );
}

AuthEmailChangeEmail.PreviewProps = {
  name: "Ada",
  newEmail: "ada@newdomain.com",
  verifyUrl: "https://learnix.app/api/auth/verify-email?token=demo",
} satisfies Props;

export default AuthEmailChangeEmail;
```

- [ ] **Step 2: Create `app/_emails/AuthAccountDeletionEmail.tsx`**

```tsx
import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "./_shared/EmailButton";
import { EmailLayout } from "./_shared/EmailLayout";

type Props = {
  name: string;
  confirmUrl: string;
};

export function AuthAccountDeletionEmail({ name, confirmUrl }: Props) {
  return (
    <EmailLayout>
      <Heading style={{ fontSize: 24, color: "#111827" }}>
        Confirm account deletion
      </Heading>
      <Text style={{ color: "#374151", fontSize: 15 }}>
        Hi {name}, we received a request to permanently delete your Learnix
        account. Click the button below to confirm. This action cannot be
        undone.
      </Text>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <EmailButton href={confirmUrl}>Delete My Account</EmailButton>
      </Section>
      <Text style={{ color: "#6b7280", fontSize: 13 }}>
        If you didn't request this, you can safely ignore this email and your
        account will remain active. This link expires in 24 hours.
      </Text>
    </EmailLayout>
  );
}

AuthAccountDeletionEmail.PreviewProps = {
  name: "Ada",
  confirmUrl:
    "https://learnix.app/api/auth/delete-user/callback?token=demo",
} satisfies Props;

export default AuthAccountDeletionEmail;
```

- [ ] **Step 3: Register both templates in `server/services/email/email.templates.ts`**

Add the two imports at the top of the file alongside the existing ones:

```ts
import { AuthAccountDeletionEmail } from "@/app/_emails/AuthAccountDeletionEmail";
import { AuthEmailChangeEmail } from "@/app/_emails/AuthEmailChangeEmail";
```

Add the two template entries inside the `emailTemplates` object (before the `// biome-ignore` comment):

```ts
"auth.email-change": {
  component: AuthEmailChangeEmail,
  payload: z.object({
    name: z.string(),
    newEmail: z.string().email(),
    verifyUrl: z.string().url(),
  }),
  subject: () => "Confirm your Learnix email change",
  criticality: "CRITICAL",
},
"auth.account-deletion": {
  component: AuthAccountDeletionEmail,
  payload: z.object({
    name: z.string(),
    confirmUrl: z.string().url(),
  }),
  subject: () => "Confirm your Learnix account deletion",
  criticality: "CRITICAL",
},
```

- [ ] **Step 4: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -20
pnpm check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/_emails/AuthEmailChangeEmail.tsx app/_emails/AuthAccountDeletionEmail.tsx server/services/email/email.templates.ts
git commit -m "feat: add email-change and account-deletion email templates"
```

---

## Task 3: Better Auth config — changeEmail, deleteUser, accountLinking

**Important API corrections vs. spec:**
- Better Auth uses `sendChangeEmailConfirmation` (not `sendChangeEmailVerification`)
- `deleteUser.beforeDelete` is the hook for pre-deletion cleanup
- The callback receives `{ user, newEmail, url, token }` for changeEmail and `{ user, url, token }` for deleteUser

**Files:**
- Modify: `server/better-auth/config.ts`

- [ ] **Step 1: Update `server/better-auth/config.ts`**

Replace the entire file content with:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";
import { emailService } from "@/server/services/email/email.service";
import { courseRepository } from "@/server/repositories/course.repository";
import { env } from "../../lib/env";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await emailService.send({
        templateKey: "auth.password-reset",
        toEmail: user.email,
        userId: user.id,
        payload: { name: user.name ?? user.email, resetUrl: url },
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    requireEmailVerification: true,
    callbackURL: "/sign-in?verified=true",
    sendVerificationEmail: async ({ user, url }) => {
      await emailService.send({
        templateKey: "auth.verify-email",
        toEmail: user.email,
        userId: user.id,
        payload: { name: user.name ?? user.email, verifyUrl: url },
      });
    },
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
      redirectURI: `${env.BASE_URL}/api/auth/callback/github`,
    },
    google: {
      clientId: env.BETTER_AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
      redirectURI: `${env.BASE_URL}/api/auth/callback/google`,
    },
  },
  plugins: [nextCookies()],
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
      // Confirmation goes to the CURRENT email for security (ADR-017)
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await emailService.send({
          templateKey: "auth.email-change",
          toEmail: user.email,
          userId: user.id,
          payload: { name: user.name ?? user.email, newEmail, verifyUrl: url },
        });
      },
    },
    deleteUser: {
      enabled: true,
      // Soft-delete instructor courses before removing the account so enrolled
      // students retain access to their course history (FR5).
      beforeDelete: async (user) => {
        await courseRepository.updateMany(
          { instructorId: user.id, deletedAt: null },
          { deletedAt: new Date() },
        );
      },
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
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | head -30
```

Expected: no errors. If Better Auth complains about `courseRepository` types, verify the import path.

- [ ] **Step 3: Commit**

```bash
git add server/better-auth/config.ts
git commit -m "feat: enable changeEmail, deleteUser, and accountLinking in Better Auth config"
```

---

## Task 4: Forgot password page (fixes the live 404)

**Files:**
- Create: `app/_components/Auth/ForgotPasswordForm/hooks/useForgotPassword.ts`
- Create: `app/_components/Auth/ForgotPasswordForm/index.tsx`
- Create: `app/(auth)/forgot-password/page.tsx`

- [ ] **Step 1: Create `app/_components/Auth/ForgotPasswordForm/hooks/useForgotPassword.ts`**

```ts
import { useState } from "react";
import { authClient } from "@/server/better-auth/client";

const useForgotPassword = () => {
  const [isPending, setIsPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async ({ email }: { email: string }) => {
    setIsPending(true);
    // Fire-and-forget: always show the generic confirmation to prevent enumeration (ADR-017)
    await authClient.forgetPassword({
      email,
      redirectTo: "/reset-password",
    });
    setIsPending(false);
    setSubmitted(true);
  };

  return { handleSubmit, isPending, submitted };
};

export default useForgotPassword;
```

- [ ] **Step 2: Create `app/_components/Auth/ForgotPasswordForm/index.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import useForgotPassword from "@/app/_components/Auth/ForgotPasswordForm/hooks/useForgotPassword";
import { emailSchema } from "@/server/entities/base";

const forgotPasswordSchema = z.object({ email: emailSchema });
type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>;

const ForgotPasswordForm = () => {
  const { isPending, submitted, handleSubmit: onSubmit } = useForgotPassword();

  const { handleSubmit, control } = useForm<ForgotPasswordData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  if (submitted) {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl">Check your email</h1>
          <p className="text-muted-foreground">
            If an account exists for that email address, you'll receive a
            password reset link shortly.
          </p>
        </div>
        <p className="text-center text-muted-foreground text-sm">
          <Link className="text-primary hover:underline" href="/sign-in">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-bold text-3xl">Forgot password?</h1>
        <p className="text-muted-foreground">
          Enter your email and we'll send you a reset link.
        </p>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <FieldGroup className="gap-4">
          <ControlledField
            control={control}
            label="Email"
            name="email"
            placeholder="name@example.com"
          />
        </FieldGroup>

        <Button className="w-full" disabled={isPending} type="submit">
          {isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Sending...
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>

      <p className="text-center text-muted-foreground text-sm">
        <Link className="text-primary hover:underline" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </div>
  );
};

export default ForgotPasswordForm;
```

- [ ] **Step 3: Create `app/(auth)/forgot-password/page.tsx`**

```tsx
import AuthLayout from "@/app/_components/_shared/components/Layouts/AuthLayout";
import ForgotPasswordForm from "@/app/_components/Auth/ForgotPasswordForm";
import { APP_NAME } from "@/lib/constants/projectName";

const author = {
  name: "James Wilson",
  position: "Product Manager",
  quote: `"${APP_NAME} helped me stay current with industry trends. The courses are practical and immediately applicable."`,
};

const ForgotPasswordPage = () => {
  return (
    <AuthLayout author={author}>
      <ForgotPasswordForm />
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
```

- [ ] **Step 4: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -20
pnpm check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/forgot-password/page.tsx" "app/_components/Auth/ForgotPasswordForm/"
git commit -m "feat: add forgot-password page, fixes 404"
```

---

## Task 5: Reset password page + SignInForm `?reset=true` toast

**Files:**
- Create: `app/_components/Auth/ResetPasswordForm/hooks/useResetPassword.ts`
- Create: `app/_components/Auth/ResetPasswordForm/index.tsx`
- Create: `app/(auth)/reset-password/page.tsx`
- Modify: `app/_components/Auth/SignInForm/index.tsx`

- [ ] **Step 1: Create `app/_components/Auth/ResetPasswordForm/hooks/useResetPassword.ts`**

```ts
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/server/better-auth/client";

const useResetPassword = () => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async ({
    newPassword,
    token,
  }: {
    newPassword: string;
    token: string;
  }) => {
    setIsPending(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword, token });
    setIsPending(false);
    if (err) {
      setError("This link is invalid or has expired.");
      return;
    }
    router.push("/sign-in?reset=true");
  };

  return { handleSubmit, isPending, error };
};

export default useResetPassword;
```

- [ ] **Step 2: Create `app/_components/Auth/ResetPasswordForm/index.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import useResetPassword from "@/app/_components/Auth/ResetPasswordForm/hooks/useResetPassword";
import { doesPasswordMatch, onPasswordMismatch } from "@/lib/utils/doesPasswordMatch";
import { passwordSchema } from "@/server/entities/base";

const resetPasswordSchema = z
  .object({ newPassword: passwordSchema, confirmPassword: passwordSchema })
  .refine(
    ({ newPassword, confirmPassword }) =>
      doesPasswordMatch({ password: newPassword, confirmPassword }),
    { ...onPasswordMismatch, path: ["confirmPassword"] },
  );

type ResetPasswordData = z.infer<typeof resetPasswordSchema>;

const ResetPasswordForm = () => {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { isPending, error, handleSubmit: onSubmit } = useResetPassword();

  const { handleSubmit, control } = useForm<ResetPasswordData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  if (!token) {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl">Invalid link</h1>
          <p className="text-muted-foreground">
            This reset link is missing or invalid.{" "}
            <Link className="text-primary hover:underline" href="/forgot-password">
              Request a new one.
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-bold text-3xl">Set new password</h1>
        <p className="text-muted-foreground">Choose a strong new password.</p>
      </div>

      <form
        className="space-y-3"
        onSubmit={handleSubmit(({ newPassword, confirmPassword }) =>
          onSubmit({ newPassword, token }),
        )}
      >
        <FieldGroup className="gap-4">
          <ControlledField
            control={control}
            label="New password"
            name="newPassword"
            placeholder="••••••••"
            type="password"
          />
          <ControlledField
            control={control}
            label="Confirm password"
            name="confirmPassword"
            placeholder="••••••••"
            type="password"
          />
        </FieldGroup>

        {error && (
          <p className="text-destructive text-sm">
            {error}{" "}
            <Link className="underline" href="/forgot-password">
              Request a new link.
            </Link>
          </p>
        )}

        <Button className="w-full" disabled={isPending} type="submit">
          {isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Saving...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </div>
  );
};

export default ResetPasswordForm;
```

- [ ] **Step 3: Create `app/(auth)/reset-password/page.tsx`**

```tsx
import { Suspense } from "react";
import AuthLayout from "@/app/_components/_shared/components/Layouts/AuthLayout";
import ResetPasswordForm from "@/app/_components/Auth/ResetPasswordForm";
import { APP_NAME } from "@/lib/constants/projectName";

const author = {
  name: "James Wilson",
  position: "Product Manager",
  quote: `"${APP_NAME} helped me stay current with industry trends. The courses are practical and immediately applicable."`,
};

const ResetPasswordPage = () => {
  return (
    <AuthLayout author={author}>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
};

export default ResetPasswordPage;
```

Note: `useSearchParams()` requires a `<Suspense>` boundary in App Router — that's why it wraps `ResetPasswordForm`.

- [ ] **Step 4: Add `?reset=true` toast to `app/_components/Auth/SignInForm/index.tsx`**

The existing `useEffect` handles `?verified=true`. Extend it to also handle `?reset=true`. Find this block in the file:

```ts
useEffect(() => {
  if (searchParams.get("verified") === "true") {
    toast.success("Email verified! You can now sign in.");
  }
}, [searchParams]);
```

Replace it with:

```ts
useEffect(() => {
  if (searchParams.get("verified") === "true") {
    toast.success("Email verified! You can now sign in.");
  }
  if (searchParams.get("reset") === "true") {
    toast.success("Password reset! You can now sign in with your new password.");
  }
}, [searchParams]);
```

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -20
pnpm check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/reset-password/page.tsx" "app/_components/Auth/ResetPasswordForm/" "app/_components/Auth/SignInForm/index.tsx"
git commit -m "feat: add reset-password page and ?reset=true toast on sign-in"
```

---

## Task 6: tRPC user procedures + integration tests

Two new `protectedProcedure`s: `updateProfile` (name + image) and `updateEmailPreferences` (toggle).

**Files:**
- Modify: `server/entities/user/index.ts`
- Modify: `server/api/routers/user.ts`
- Create: `server/api/routers/user.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `server/api/routers/user.integration.test.ts`:

```ts
// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { afterEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { createCallerFactory, createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { testDb } from "@/test/db";
import { truncateAll } from "@/test/db";
import { makeUser } from "@/test/factories";
import { userRouter } from "./user";

const createCaller = createCallerFactory(userRouter);

function ctxForUser(userId: string, role: Role = Role.STUDENT) {
  return {
    db: testDb,
    headers: new Headers(),
    session: { user: { id: userId, role }, session: { id: "s1" } },
  } as never;
}

function anonCtx() {
  return {
    db: testDb,
    headers: new Headers(),
    session: null,
  } as never;
}

afterEach(() => truncateAll());

describe("user.updateProfile", () => {
  it("updates name and image for the authenticated user", async () => {
    const user = await makeUser({ role: Role.STUDENT });
    const caller = createCaller(ctxForUser(user.id));

    await caller.updateProfile({ name: "New Name", image: null });

    const updated = await testDb.user.findUnique({ where: { id: user.id } });
    expect(updated?.name).toBe("New Name");
  });

  it("rejects anonymous callers with UNAUTHORIZED", async () => {
    const caller = createCaller(anonCtx());
    await expect(caller.updateProfile({ name: "x", image: null })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("user.updateEmailPreferences", () => {
  it("writes emailNotificationsEnabled to the DB", async () => {
    const user = await makeUser({ role: Role.STUDENT });
    const caller = createCaller(ctxForUser(user.id));

    await caller.updateEmailPreferences({ emailNotificationsEnabled: false });

    const updated = await testDb.user.findUnique({ where: { id: user.id } });
    expect(updated?.emailNotificationsEnabled).toBe(false);

    await caller.updateEmailPreferences({ emailNotificationsEnabled: true });
    const toggled = await testDb.user.findUnique({ where: { id: user.id } });
    expect(toggled?.emailNotificationsEnabled).toBe(true);
  });

  it("rejects anonymous callers with UNAUTHORIZED", async () => {
    const caller = createCaller(anonCtx());
    await expect(
      caller.updateEmailPreferences({ emailNotificationsEnabled: false }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
```

- [ ] **Step 2: Run the tests — expect them to fail**

```bash
pnpm test:integration server/api/routers/user.integration.test.ts 2>&1 | tail -20
```

Expected: FAIL — `updateProfile` and `updateEmailPreferences` are not defined yet.

- [ ] **Step 3: Add DTOs to `server/entities/user/index.ts`**

Append at the end of the file:

```ts
export const ProfileUpdateSchema = z.object({
  name: nameSchema,
  image: z.string().url().nullable(),
});
export type ProfileUpdateData = z.infer<typeof ProfileUpdateSchema>;

export const EmailPreferencesSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
});
export type EmailPreferencesData = z.infer<typeof EmailPreferencesSchema>;
```

- [ ] **Step 4: Add procedures to `server/api/routers/user.ts`**

Replace the entire file:

```ts
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  EmailPreferencesSchema,
  ProfileUpdateSchema,
  signUpSchema,
} from "@/server/entities/user";
import { authService } from "@/server/services/auth/auth.service";
import { userService } from "@/server/services/user/user.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const userRouter = createTRPCRouter({
  signUp: publicProcedure.input(signUpSchema).mutation(async ({ input }) => {
    try {
      return await authService.signUp({
        email: input.email,
        name: input.name,
        password: input.password,
      });
    } catch (error) {
      handleServiceError(error);
    }
  }),

  updateProfile: protectedProcedure
    .input(ProfileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await userService.updateUser(ctx.session.user.id, {
          name: input.name,
          ...(input.image !== undefined && { image: input.image }),
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  updateEmailPreferences: protectedProcedure
    .input(EmailPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await userService.updateUser(ctx.session.user.id, {
          emailNotificationsEnabled: input.emailNotificationsEnabled,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
```

- [ ] **Step 5: Run the tests — expect them to pass**

```bash
pnpm test:integration server/api/routers/user.integration.test.ts 2>&1 | tail -20
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -20
pnpm check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/entities/user/index.ts server/api/routers/user.ts server/api/routers/user.integration.test.ts
git commit -m "feat: add updateProfile and updateEmailPreferences tRPC procedures with integration tests"
```

---

## Task 7: Account Settings — ProfileSection and PasswordSection

**Files:**
- Create: `app/_components/Account/ProfileSection/hooks/useProfileForm.ts`
- Create: `app/_components/Account/ProfileSection/index.tsx`
- Create: `app/_components/Account/PasswordSection/hooks/usePasswordForm.ts`
- Create: `app/_components/Account/PasswordSection/index.tsx`

- [ ] **Step 1: Create `app/_components/Account/ProfileSection/hooks/useProfileForm.ts`**

```ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/trpc/client";
import { ProfileUpdateSchema, type ProfileUpdateData } from "@/server/entities/user";

const useProfileForm = (initialName: string, initialImage: string | null) => {
  const { control, handleSubmit, reset } = useForm<ProfileUpdateData>({
    resolver: zodResolver(ProfileUpdateSchema),
    defaultValues: { name: initialName, image: initialImage },
  });

  useEffect(() => {
    reset({ name: initialName, image: initialImage });
  }, [initialName, initialImage, reset]);

  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: () => toast.success("Profile updated."),
    onError: () => toast.error("Failed to update profile."),
  });

  const onSubmit = handleSubmit((data) => updateProfile.mutate(data));

  return { control, onSubmit, isPending: updateProfile.isPending };
};

export default useProfileForm;
```

- [ ] **Step 2: Create `app/_components/Account/ProfileSection/index.tsx`**

```tsx
"use client";

import { Loader2 } from "lucide-react";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import useProfileForm from "@/app/_components/Account/ProfileSection/hooks/useProfileForm";
import { authClient } from "@/server/better-auth/client";

const ProfileSection = () => {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const { control, onSubmit, isPending } = useProfileForm(
    user?.name ?? "",
    user?.image ?? null,
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Profile</h2>
        <p className="text-muted-foreground text-sm">
          Update your display name and avatar URL.
        </p>
      </div>

      <form className="max-w-md space-y-3" onSubmit={onSubmit}>
        <FieldGroup className="gap-4">
          <ControlledField
            control={control}
            label="Full name"
            name="name"
            placeholder="Your name"
          />
          <ControlledField
            control={control}
            label="Avatar URL"
            name="image"
            placeholder="https://..."
          />
        </FieldGroup>

        <Button disabled={isPending} type="submit">
          {isPending ? <Loader2 className="animate-spin" /> : null}
          Save profile
        </Button>
      </form>
    </section>
  );
};

export default ProfileSection;
```

- [ ] **Step 3: Create `app/_components/Account/PasswordSection/hooks/usePasswordForm.ts`**

```ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { doesPasswordMatch, onPasswordMismatch } from "@/lib/utils/doesPasswordMatch";
import { passwordSchema } from "@/server/entities/base";
import { authClient } from "@/server/better-auth/client";

const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine(
    ({ newPassword, confirmPassword }) =>
      doesPasswordMatch({ password: newPassword, confirmPassword }),
    { ...onPasswordMismatch, path: ["confirmPassword"] },
  );

type ChangePasswordData = z.infer<typeof changePasswordSchema>;

const usePasswordForm = () => {
  const [isPending, setIsPending] = useState(false);

  const { control, handleSubmit, reset } = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setIsPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setIsPending(false);
    if (error) {
      toast.error(
        error.message ?? "Failed to change password. Check your current password.",
      );
      return;
    }
    toast.success("Password changed. Other sessions have been signed out.");
    reset();
  });

  return { control, onSubmit, isPending };
};

export default usePasswordForm;
```

- [ ] **Step 4: Create `app/_components/Account/PasswordSection/index.tsx`**

```tsx
"use client";

import { Loader2 } from "lucide-react";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import usePasswordForm from "@/app/_components/Account/PasswordSection/hooks/usePasswordForm";

const PasswordSection = () => {
  const { control, onSubmit, isPending } = usePasswordForm();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Password</h2>
        <p className="text-muted-foreground text-sm">
          Change your password. Other active sessions will be signed out.
        </p>
      </div>

      <form className="max-w-md space-y-3" onSubmit={onSubmit}>
        <FieldGroup className="gap-4">
          <ControlledField
            control={control}
            label="Current password"
            name="currentPassword"
            placeholder="••••••••"
            type="password"
          />
          <ControlledField
            control={control}
            label="New password"
            name="newPassword"
            placeholder="••••••••"
            type="password"
          />
          <ControlledField
            control={control}
            label="Confirm new password"
            name="confirmPassword"
            placeholder="••••••••"
            type="password"
          />
        </FieldGroup>

        <Button disabled={isPending} type="submit">
          {isPending ? <Loader2 className="animate-spin" /> : null}
          Change password
        </Button>
      </form>
    </section>
  );
};

export default PasswordSection;
```

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -20
pnpm check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/_components/Account/ProfileSection/ app/_components/Account/PasswordSection/
git commit -m "feat: add account settings ProfileSection and PasswordSection"
```

---

## Task 8: Account Settings — EmailSection and NotificationsSection

**Files:**
- Create: `app/_components/Account/EmailSection/hooks/useEmailForm.ts`
- Create: `app/_components/Account/EmailSection/index.tsx`
- Create: `app/_components/Account/NotificationsSection/hooks/useNotificationsToggle.ts`
- Create: `app/_components/Account/NotificationsSection/index.tsx`

- [ ] **Step 1: Create `app/_components/Account/EmailSection/hooks/useEmailForm.ts`**

```ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { emailSchema } from "@/server/entities/base";
import { authClient } from "@/server/better-auth/client";

const changeEmailSchema = z.object({ newEmail: emailSchema });
type ChangeEmailData = z.infer<typeof changeEmailSchema>;

const useEmailForm = () => {
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);

  const { control, handleSubmit, reset } = useForm<ChangeEmailData>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "" },
  });

  const onSubmit = handleSubmit(async ({ newEmail }) => {
    setIsPending(true);
    const { error } = await authClient.changeEmail({
      newEmail,
      callbackURL: "/dashboard/settings",
    });
    setIsPending(false);
    if (error) {
      toast.error(error.message ?? "Failed to request email change.");
      return;
    }
    toast.success("Confirmation email sent to your current address.");
    setSent(true);
    reset();
  });

  return { control, onSubmit, isPending, sent };
};

export default useEmailForm;
```

- [ ] **Step 2: Create `app/_components/Account/EmailSection/index.tsx`**

```tsx
"use client";

import { Loader2 } from "lucide-react";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import useEmailForm from "@/app/_components/Account/EmailSection/hooks/useEmailForm";
import { authClient } from "@/server/better-auth/client";

const EmailSection = () => {
  const { data: session } = authClient.useSession();
  const { control, onSubmit, isPending, sent } = useEmailForm();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Email address</h2>
        <p className="text-muted-foreground text-sm">
          Current: <span className="font-medium">{session?.user.email}</span>
        </p>
      </div>

      {sent ? (
        <p className="text-muted-foreground text-sm">
          Check your current inbox to confirm the change. The email won't
          update until you click the link.
        </p>
      ) : (
        <form className="max-w-md space-y-3" onSubmit={onSubmit}>
          <FieldGroup>
            <ControlledField
              control={control}
              label="New email address"
              name="newEmail"
              placeholder="new@example.com"
            />
          </FieldGroup>

          <Button disabled={isPending} type="submit">
            {isPending ? <Loader2 className="animate-spin" /> : null}
            Request email change
          </Button>
        </form>
      )}
    </section>
  );
};

export default EmailSection;
```

- [ ] **Step 3: Create `app/_components/Account/NotificationsSection/hooks/useNotificationsToggle.ts`**

```ts
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/client";

const useNotificationsToggle = (initialEnabled: boolean) => {
  const [enabled, setEnabled] = useState(initialEnabled);

  const updatePreferences = api.user.updateEmailPreferences.useMutation({
    onSuccess: (_, { emailNotificationsEnabled }) => {
      setEnabled(emailNotificationsEnabled);
      toast.success(
        emailNotificationsEnabled
          ? "Email notifications enabled."
          : "Email notifications disabled.",
      );
    },
    onError: () => toast.error("Failed to update notification preference."),
  });

  const toggle = () =>
    updatePreferences.mutate({ emailNotificationsEnabled: !enabled });

  return { enabled, toggle, isPending: updatePreferences.isPending };
};

export default useNotificationsToggle;
```

- [ ] **Step 4: Create `app/_components/Account/NotificationsSection/index.tsx`**

```tsx
"use client";

import { Switch } from "@/app/_components/_shared/ui/switch";
import useNotificationsToggle from "@/app/_components/Account/NotificationsSection/hooks/useNotificationsToggle";

type Props = {
  initialEnabled: boolean;
};

const NotificationsSection = ({ initialEnabled }: Props) => {
  const { enabled, toggle, isPending } = useNotificationsToggle(initialEnabled);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Email notifications</h2>
        <p className="text-muted-foreground text-sm">
          Lifecycle and marketing emails (enrollment confirmations, course
          updates). Critical auth emails always send regardless of this setting.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={enabled}
          disabled={isPending}
          id="notifications-toggle"
          onCheckedChange={toggle}
        />
        <label className="cursor-pointer text-sm" htmlFor="notifications-toggle">
          {enabled ? "Notifications on" : "Notifications off"}
        </label>
      </div>
    </section>
  );
};

export default NotificationsSection;
```

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -20
pnpm check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/_components/Account/EmailSection/ app/_components/Account/NotificationsSection/
git commit -m "feat: add account settings EmailSection and NotificationsSection"
```

---

## Task 9: Account Settings — ConnectedAccountsSection and SessionsSection

**Files:**
- Create: `app/_components/Account/ConnectedAccountsSection/index.tsx`
- Create: `app/_components/Account/SessionsSection/index.tsx`

- [ ] **Step 1: Create `app/_components/Account/ConnectedAccountsSection/index.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { authClient } from "@/server/better-auth/client";

type Account = { id: string; provider: string; accountId: string };

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  credential: "Email & Password",
};

const ConnectedAccountsSection = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = async () => {
    const { data } = await authClient.listAccounts();
    setAccounts((data ?? []) as Account[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const handleLink = async (provider: "github" | "google") => {
    await authClient.linkSocial({
      provider,
      callbackURL: "/dashboard/settings",
    });
  };

  const handleUnlink = async (account: Account) => {
    if (accounts.length <= 1) {
      toast.error("You must keep at least one sign-in method.");
      return;
    }
    const { error } = await authClient.unlinkAccount({
      providerId: account.provider,
    });
    if (error) {
      toast.error(error.message ?? "Failed to unlink account.");
      return;
    }
    toast.success(`${PROVIDER_LABELS[account.provider] ?? account.provider} unlinked.`);
    void loadAccounts();
  };

  const linkedProviders = accounts.map((a) => a.provider);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Connected accounts</h2>
        <p className="text-muted-foreground text-sm">
          Link social accounts for faster sign-in.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <ul className="max-w-md divide-y rounded-md border">
          {(["github", "google"] as const).map((provider) => {
            const account = accounts.find((a) => a.provider === provider);
            return (
              <li
                key={provider}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="font-medium text-sm">
                  {PROVIDER_LABELS[provider]}
                </span>
                {account ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUnlink(account)}
                  >
                    Unlink
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLink(provider)}
                  >
                    Link
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ConnectedAccountsSection;
```

- [ ] **Step 2: Create `app/_components/Account/SessionsSection/index.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import { authClient } from "@/server/better-auth/client";

type SessionItem = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  ipAddress: string | null;
};

const SessionsSection = () => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: currentSession } = authClient.useSession();

  const loadSessions = async () => {
    const { data } = await authClient.listSessions();
    setSessions((data ?? []) as SessionItem[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const revoke = async (sessionId: string) => {
    const { error } = await authClient.revokeSession({ token: sessionId });
    if (error) {
      toast.error("Failed to revoke session.");
      return;
    }
    toast.success("Session revoked.");
    void loadSessions();
  };

  const revokeOthers = async () => {
    const { error } = await authClient.revokeOtherSessions();
    if (error) {
      toast.error("Failed to revoke sessions.");
      return;
    }
    toast.success("All other sessions revoked.");
    void loadSessions();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Active sessions</h2>
          <p className="text-muted-foreground text-sm">
            Devices and browsers currently signed in.
          </p>
        </div>
        {sessions.length > 1 && (
          <Button size="sm" variant="outline" onClick={revokeOthers}>
            Sign out all others
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <ul className="max-w-xl divide-y rounded-md border">
          {sessions.map((s) => {
            const isCurrent = s.id === currentSession?.session.id;
            return (
              <li
                key={s.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm">
                    {s.userAgent ?? "Unknown browser"}
                    {isCurrent && (
                      <span className="ml-2 text-muted-foreground text-xs">
                        (this device)
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {s.ipAddress ?? "Unknown IP"} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {!isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => revoke(s.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default SessionsSection;
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -20
pnpm check 2>&1 | head -20
```

Expected: no errors. If `authClient.revokeSession` expects `{ token }` vs `{ id }`, verify with the runtime — check `node_modules/better-auth/dist/api/routes/session.mjs` for the exact param name.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Account/ConnectedAccountsSection/ app/_components/Account/SessionsSection/
git commit -m "feat: add account settings ConnectedAccountsSection and SessionsSection"
```

---

## Task 10: DangerZoneSection + SettingsShell + Settings page

Wire all sections together into the settings hub at `app/dashboard/settings/page.tsx`.

**Files:**
- Create: `app/_components/Account/DangerZoneSection/hooks/useDangerZone.ts`
- Create: `app/_components/Account/DangerZoneSection/index.tsx`
- Create: `app/_components/Account/SettingsShell/index.tsx`
- Create: `app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create `app/_components/Account/DangerZoneSection/hooks/useDangerZone.ts`**

```ts
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/server/better-auth/client";

const useDangerZone = () => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const deleteAccount = async (password: string) => {
    setIsPending(true);
    const { error } = await authClient.deleteUser({ password, callbackURL: "/" });
    setIsPending(false);
    if (error) {
      toast.error(
        error.message ??
          "Failed to delete account. Check your password and try again.",
      );
      return;
    }
    setOpen(false);
    await authClient.signOut();
    router.push("/");
  };

  return { open, setOpen, isPending, deleteAccount };
};

export default useDangerZone;
```

- [ ] **Step 2: Create `app/_components/Account/DangerZoneSection/index.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/_components/_shared/ui/dialog";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";
import useDangerZone from "@/app/_components/Account/DangerZoneSection/hooks/useDangerZone";

const DangerZoneSection = () => {
  const { open, setOpen, isPending, deleteAccount } = useDangerZone();
  const [password, setPassword] = useState("");

  const handleDelete = () => {
    if (!password) return;
    void deleteAccount(password);
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-destructive text-lg">Danger zone</h2>
        <p className="text-muted-foreground text-sm">
          Permanently delete your account. This action cannot be undone.
          Instructor courses will be soft-deleted to preserve enrolled students'
          access.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">Delete account</Button>
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account</DialogTitle>
            <DialogDescription>
              This permanently removes your account, sessions, and associated
              data. Courses you created will be archived, not erased. Enter your
              password to confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Password</Label>
            <Input
              id="confirm-password"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isPending || !password}
              variant="destructive"
              onClick={handleDelete}
            >
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default DangerZoneSection;
```

- [ ] **Step 3: Create `app/_components/Account/SettingsShell/index.tsx`**

```tsx
"use client";

import DangerZoneSection from "@/app/_components/Account/DangerZoneSection";
import EmailSection from "@/app/_components/Account/EmailSection";
import NotificationsSection from "@/app/_components/Account/NotificationsSection";
import PasswordSection from "@/app/_components/Account/PasswordSection";
import ProfileSection from "@/app/_components/Account/ProfileSection";
import ConnectedAccountsSection from "@/app/_components/Account/ConnectedAccountsSection";
import SessionsSection from "@/app/_components/Account/SessionsSection";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/_components/_shared/ui/tabs";
import { Separator } from "@/app/_components/_shared/ui/separator";

type Props = {
  emailNotificationsEnabled: boolean;
};

const SettingsShell = ({ emailNotificationsEnabled }: Props) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Account settings</h1>
        <p className="text-muted-foreground">
          Manage your profile, security, and preferences.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="accounts">Connected accounts</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-8">
          <PasswordSection />
          <Separator />
          <EmailSection />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationsSection initialEnabled={emailNotificationsEnabled} />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <ConnectedAccountsSection />
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <SessionsSection />
        </TabsContent>

        <TabsContent value="danger" className="mt-6">
          <DangerZoneSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsShell;
```

- [ ] **Step 4: Create `app/dashboard/settings/page.tsx`**

This is a Server Component that fetches the current user's `emailNotificationsEnabled` value and passes it as initial state to the shell.

```tsx
import { redirect } from "next/navigation";
import SettingsShell from "@/app/_components/Account/SettingsShell";
import { getSession } from "@/server/better-auth/server";
import { userRepository } from "@/server/repositories/user.repository";

const SettingsPage = async () => {
  const session = await getSession();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const user = await userRepository.findFirst({
    where: { id: session.user.id },
    select: { emailNotificationsEnabled: true },
  });

  return (
    <SettingsShell
      emailNotificationsEnabled={user?.emailNotificationsEnabled ?? true}
    />
  );
};

export default SettingsPage;
```

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck 2>&1 | head -30
pnpm check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Run all tests**

```bash
pnpm test 2>&1 | tail -20
```

Expected: all tests pass (including the new integration tests from Task 6).

- [ ] **Step 7: Commit**

```bash
git add app/_components/Account/DangerZoneSection/ app/_components/Account/SettingsShell/ app/dashboard/settings/page.tsx
git commit -m "feat: add account settings hub with all sections (profile, security, notifications, connected accounts, sessions, danger zone)"
```

---

## Spec Coverage Self-Check

| Requirement | Task |
|-------------|------|
| FR1 — Forgot password page | Task 4 |
| FR2 — Reset password page | Task 5 |
| FR3 — Account settings hub (all 7 sections) | Tasks 7–10 |
| FR4 — Notification preference honored (email.service already checks `emailNotificationsEnabled`) | No code change needed — confirmed in `email.service.ts` lines 33–40 |
| FR5 — Account deletion policy / instructor course soft-delete | Task 3 (`beforeDelete` hook) |
| ADR-017 — No account enumeration on forgot-password | Task 4 (`setSubmitted(true)` regardless of response) |
| ADR-017 — Current password required for change | Task 7 (`changePassword` requires `currentPassword`) |
| ADR-017 — Email change to current address | Task 3 (`sendChangeEmailConfirmation` sends to `user.email`) |
| ADR-017 — Deletion requires fresh confirmation | Task 10 (password re-entry in dialog) |
| Switch UI component | Task 1 |
| Integration tests for new tRPC procedures | Task 6 |