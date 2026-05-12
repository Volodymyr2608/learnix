# Plan: Resend + React Email

## Implementation order

1. Add deps + env vars.
2. Schema change: `User.welcomeEmailSentAt` (and `emailNotificationsEnabled` if Phase 12 hasn't shipped) + migration.
3. Template registry + renderer.
4. `EmailService` (validate + opt-out + render + Resend send).
5. Seven React Email templates + shared layout.
6. `POST /api/emails/send` route.
7. Better Auth wiring (`sendVerificationEmail`, `sendResetPassword`).
8. `enrollment.confirmed` wiring in `EnrollmentService`.
9. `user.welcome` wiring in the dashboard layout.
10. n8n workflow surgery (drop `_sub_resend_send`; single POST to `/api/emails/send`).
11. `pnpm email:dev` preview script.
12. ADR-015 + roadmap + README updates.

---

## Step 1 — Dependencies & env

```bash
pnpm add resend @react-email/components @react-email/render
pnpm add -D react-email
```

`lib/env.js` — add to `server` schema:

```js
RESEND_API_KEY:     z.string().min(1),
EMAIL_FROM_ADDRESS: z.string().email(),
EMAIL_REPLY_TO:     z.string().email().optional(),
```

Update `.env.example` accordingly.

`package.json` scripts:

```json
"email:dev": "email dev --dir app/_emails --port 3001"
```

---

## Step 2 — Schema change

`prisma/schema/auth.prisma` — add to `User`:

```prisma
welcomeEmailSentAt DateTime?
```

If Phase 12 (ADR-014) hasn't shipped, also add:

```prisma
emailNotificationsEnabled Boolean @default(true)
```

`pnpm db:generate` creates the migration. No new tables.

---

## Step 3 — Template registry + renderer

`server/services/email/email.templates.ts`:

```ts
import { z } from "zod";
import type { ComponentType } from "react";
import { AuthVerifyEmail }              from "@/app/_emails/AuthVerifyEmail";
import { AuthPasswordResetEmail }       from "@/app/_emails/AuthPasswordResetEmail";
import { UserWelcomeEmail }             from "@/app/_emails/UserWelcomeEmail";
import { EnrollmentConfirmedEmail }     from "@/app/_emails/EnrollmentConfirmedEmail";
import { CourseCertificateEmail }       from "@/app/_emails/CourseCertificateEmail";
import { EngagementInactivityEmail }    from "@/app/_emails/EngagementInactivityEmail";
import { EngagementNearCompletionEmail } from "@/app/_emails/EngagementNearCompletionEmail";

type Entry<P> = {
  component: ComponentType<P>;
  payload:   z.ZodSchema<P>;
  subject:   (p: P) => string;
  criticality: "CRITICAL" | "STANDARD";
};

export const emailTemplates = {
  "auth.verify-email": {
    component: AuthVerifyEmail,
    payload:   z.object({ name: z.string(), verifyUrl: z.string().url() }),
    subject:   () => "Verify your Learnix email",
    criticality: "CRITICAL",
  },
  "auth.password-reset": {
    component: AuthPasswordResetEmail,
    payload:   z.object({ name: z.string(), resetUrl: z.string().url() }),
    subject:   () => "Reset your Learnix password",
    criticality: "CRITICAL",
  },
  "user.welcome": {
    component: UserWelcomeEmail,
    payload:   z.object({ name: z.string(), browseUrl: z.string().url(), unsubscribeUrl: z.string().url() }),
    subject:   (p) => `Welcome to Learnix, ${p.name} 👋`,
    criticality: "STANDARD",
  },
  "enrollment.confirmed": {
    component: EnrollmentConfirmedEmail,
    payload:   z.object({
      studentName: z.string(),
      courseTitle: z.string(),
      courseUrl:   z.string().url(),
      unsubscribeUrl: z.string().url(),
    }),
    subject:   (p) => `You're enrolled in ${p.courseTitle}`,
    criticality: "STANDARD",
  },
  "course.certificate": {
    component: CourseCertificateEmail,
    payload:   z.object({
      studentName: z.string(),
      courseTitle: z.string(),
      instructorName: z.string(),
      certificatePdfUrl: z.string().url(),
      unsubscribeUrl: z.string().url(),
    }),
    subject:   (p) => `🎓 You completed ${p.courseTitle}`,
    criticality: "STANDARD",
  },
  "engagement.inactivity-7d": {
    component: EngagementInactivityEmail,
    payload:   z.object({
      studentName: z.string(),
      courseTitle: z.string(),
      nextLessonTitle: z.string(),
      resumeUrl: z.string().url(),
      progressPct: z.number(),
      unsubscribeUrl: z.string().url(),
    }),
    subject:   (p) => `Pick up where you left off in ${p.courseTitle}`,
    criticality: "STANDARD",
  },
  "engagement.near-completion": {
    component: EngagementNearCompletionEmail,
    payload:   z.object({
      studentName: z.string(),
      courseTitle: z.string(),
      lessonsRemaining: z.number(),
      nextLessonUrl: z.string().url(),
      unsubscribeUrl: z.string().url(),
    }),
    subject:   (p) => `${p.lessonsRemaining} lessons left in ${p.courseTitle} 🏁`,
    criticality: "STANDARD",
  },
} as const satisfies Record<string, Entry<any>>;

export type TemplateKey = keyof typeof emailTemplates;
```

`server/services/email/email.renderer.ts`:

```ts
import { render } from "@react-email/render";
import { createElement } from "react";
import { emailTemplates, type TemplateKey } from "./email.templates";

export async function renderTemplate(key: TemplateKey, payload: unknown) {
  const entry = emailTemplates[key];
  const parsed = entry.payload.parse(payload);
  const element = createElement(entry.component, parsed);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text, subject: entry.subject(parsed) };
}
```

---

## Step 4 — EmailService

`server/services/email/email.errors.ts`:

```ts
export class UnknownTemplateError extends Error { code = "UNKNOWN_TEMPLATE"; }
export class InvalidPayloadError  extends Error {
  code = "INVALID_PAYLOAD";
  constructor(public issues: unknown) { super("Invalid email payload"); }
}
export class ResendSendError extends Error { code = "RESEND_SEND_FAILED"; }
```

`server/services/email/email.service.ts`:

```ts
import { Resend } from "resend";
import { env } from "@/lib/env";
import { userRepository } from "@/server/repositories/user.repository";
import { renderTemplate } from "./email.renderer";
import { emailTemplates, type TemplateKey } from "./email.templates";
import { UnknownTemplateError, InvalidPayloadError, ResendSendError } from "./email.errors";

const resend = new Resend(env.RESEND_API_KEY);

type SendInput = {
  templateKey: TemplateKey | string;
  toEmail: string;
  userId?: string;
  payload: unknown;
};

class EmailService {
  async send(input: SendInput) {
    const entry = emailTemplates[input.templateKey as TemplateKey];
    if (!entry) throw new UnknownTemplateError(input.templateKey);

    // Opt-out gate — skip non-CRITICAL templates for users who opted out.
    if (entry.criticality !== "CRITICAL" && input.userId) {
      const user = await userRepository.findById(input.userId);
      if (user && !user.emailNotificationsEnabled) {
        return { skipped: "opted_out" as const };
      }
    }

    // Validate payload — throws InvalidPayloadError if shape is wrong.
    const parsed = entry.payload.safeParse(input.payload);
    if (!parsed.success) throw new InvalidPayloadError(parsed.error.issues);

    const { html, text, subject } = await renderTemplate(input.templateKey as TemplateKey, parsed.data);

    const result = await resend.emails.send({
      from: env.EMAIL_FROM_ADDRESS,
      replyTo: env.EMAIL_REPLY_TO,
      to: input.toEmail,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error("resend_failed", { templateKey: input.templateKey, toEmail: input.toEmail, error: result.error });
      throw new ResendSendError(result.error.message);
    }

    return { id: result.data!.id };
  }
}

export const emailService = new EmailService();
```

No DB writes, no retry loop. Pure: validate → render → send.

---

## Step 5 — Templates

`app/_emails/_shared/EmailLayout.tsx`:

```tsx
import { Html, Head, Body, Container, Section, Img, Hr } from "@react-email/components";
import { EmailFooter } from "./EmailFooter";

export function EmailLayout({ unsubscribeUrl, children }: { unsubscribeUrl?: string; children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Body style={{ background: "#f6f6f6", fontFamily: "ui-sans-serif, system-ui" }}>
        <Container style={{ background: "#fff", padding: 32, maxWidth: 560 }}>
          <Section><Img src="https://learnix.app/logo.png" alt="Learnix" width="120" /></Section>
          {children}
          <Hr />
          <EmailFooter unsubscribeUrl={unsubscribeUrl} />
        </Container>
      </Body>
    </Html>
  );
}
```

`app/_emails/_shared/EmailFooter.tsx` — address + unsubscribe link (omitted when `unsubscribeUrl` undefined, e.g. auth emails).

`app/_emails/_shared/EmailButton.tsx` — `<Button>` from `@react-email/components` styled with brand colours.

**Template skeletons** — each follows the same pattern. Example:

`app/_emails/CourseCertificateEmail.tsx`:

```tsx
import { Heading, Text, Section } from "@react-email/components";
import { EmailLayout } from "./_shared/EmailLayout";
import { EmailButton } from "./_shared/EmailButton";

type Props = {
  studentName: string;
  courseTitle: string;
  instructorName: string;
  certificatePdfUrl: string;
  unsubscribeUrl: string;
};

export function CourseCertificateEmail({
  studentName, courseTitle, instructorName, certificatePdfUrl, unsubscribeUrl,
}: Props) {
  return (
    <EmailLayout unsubscribeUrl={unsubscribeUrl}>
      <Heading>🎓 You did it, {studentName}!</Heading>
      <Text>You completed <strong>{courseTitle}</strong> taught by {instructorName}.</Text>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <EmailButton href={certificatePdfUrl}>Download your certificate</EmailButton>
      </Section>
      <Text>Share what you learned and tag us — we love seeing it.</Text>
    </EmailLayout>
  );
}

CourseCertificateEmail.PreviewProps = {
  studentName: "Ada",
  courseTitle: "Intro to RAG",
  instructorName: "Alan",
  certificatePdfUrl: "https://learnix.app/api/certificates/enr_demo?token=demo",
  unsubscribeUrl: "https://learnix.app/unsubscribe?token=demo",
} satisfies Props;

export default CourseCertificateEmail;
```

Repeat for the other six templates. `auth.verify-email` and `auth.password-reset` use `<EmailLayout>` *without* `unsubscribeUrl` so the footer omits the link (transactional + critical).

---

## Step 6 — Send endpoint

`app/api/emails/send/route.ts`:

```ts
import { env } from "@/lib/env";
import { emailService } from "@/server/services/email/email.service";
import {
  UnknownTemplateError,
  InvalidPayloadError,
  ResendSendError,
} from "@/server/services/email/email.errors";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.N8N_API_TOKEN}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const result = await emailService.send(body);
    return Response.json(result);
  } catch (e) {
    if (e instanceof UnknownTemplateError) return Response.json({ error: "unknown_template" }, { status: 400 });
    if (e instanceof InvalidPayloadError)  return Response.json({ error: "invalid_payload", issues: e.issues }, { status: 422 });
    if (e instanceof ResendSendError)      return Response.json({ error: "resend_failed", detail: e.message }, { status: 502 });
    throw e;
  }
}
```

---

## Step 7 — Better Auth integration

In `server/better-auth/server.ts` (or wherever `betterAuth({ … })` is configured):

```ts
emailAndPassword: {
  enabled: true,
  sendResetPassword: async ({ user, url }) => {
    await emailService.send({
      templateKey: "auth.password-reset",
      toEmail:     user.email,
      userId:      user.id,
      payload:     { name: user.name ?? user.email, resetUrl: url },
    });
  },
},
emailVerification: {
  sendOnSignUp: true,
  sendVerificationEmail: async ({ user, url }) => {
    await emailService.send({
      templateKey: "auth.verify-email",
      toEmail:     user.email,
      userId:      user.id,
      payload:     { name: user.name ?? user.email, verifyUrl: url },
    });
  },
},
```

If `emailService.send` throws, Better Auth surfaces the error as a failed request — the user sees a generic "couldn't send email, try again" and re-clicks. No app-side retry.

---

## Step 8 — Enrollment confirmation

`server/services/enrollment/enrollment.service.ts` — at the end of a successful `enrollInCourse` (after the recompute-user-interest hook):

```ts
const unsubscribeUrl = `${env.BASE_URL}/unsubscribe?token=${await signUnsubscribeToken(studentId)}`;
void emailService.send({
  templateKey: "enrollment.confirmed",
  toEmail:     student.email,
  userId:      studentId,
  payload: {
    studentName: student.name ?? student.email,
    courseTitle: course.title,
    courseUrl:   `${env.BASE_URL}/dashboard/courses/${course.slug}`,
    unsubscribeUrl,
  },
}).catch(err => console.error("enrollment email failed", err));
```

Fire-and-forget — an email failure does not roll back the enrolment.

`signUnsubscribeToken` is provided by Phase 12 (ADR-014's `server/services/notifications/auth.ts`). If Phase 12 isn't shipped, the simplest stop-gap is to inline a small helper:

```ts
import { SignJWT } from "jose";
import { env } from "@/lib/env";

const secret = () => new TextEncoder().encode(env.N8N_API_TOKEN);

export async function signUnsubscribeToken(userId: string) {
  return new SignJWT({ userId, kind: "unsub" })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secret());
}
```

---

## Step 9 — Welcome email on first verified login

Fire from the dashboard root layout server component (`app/dashboard/layout.tsx`), gated by `User.welcomeEmailSentAt`:

```tsx
// app/dashboard/layout.tsx (server component)
import { getServerSession } from "@/server/better-auth/server";
import { userRepository } from "@/server/repositories/user.repository";
import { emailService } from "@/server/services/email/email.service";
import { signUnsubscribeToken } from "@/server/services/notifications/auth"; // or local stop-gap
import { env } from "@/lib/env";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (session?.user && session.user.emailVerified && !session.user.welcomeEmailSentAt) {
    // Fire once; mark the user so subsequent renders skip the check.
    void (async () => {
      try {
        await emailService.send({
          templateKey: "user.welcome",
          toEmail:     session.user.email,
          userId:      session.user.id,
          payload: {
            name: session.user.name ?? session.user.email,
            browseUrl: `${env.BASE_URL}/dashboard/browse`,
            unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${await signUnsubscribeToken(session.user.id)}`,
          },
        });
        await userRepository.update(session.user.id, { welcomeEmailSentAt: new Date() });
      } catch (err) {
        console.error("welcome email failed", err);
      }
    })();
  }
  return <>{children}</>;
}
```

Idempotency: even if two parallel page loads race, the worst case is two welcome emails (rare). If that's too much, wrap the read+update in a `db.user.updateMany({ where: { id, welcomeEmailSentAt: null }, data: { welcomeEmailSentAt: now } })` and only send when the update reports `count === 1`.

---

## Step 10 — n8n workflow surgery

Open each of the three workflows in n8n (Phase 12). Per-workflow change:

| Workflow | Replace `_sub_resend_send` with single HTTP node POST to `/api/emails/send` |
|---|---|
| `certificate` | `templateKey: "course.certificate"`, body mapped from `{{ $json.user.email }}`, `{{ $json.user.id }}`, etc. The `NotificationLog` POST/DELETE flow (ADR-014) stays in place. |
| `inactivity` | `templateKey: "engagement.inactivity-7d"`, body mapped per student item in the Split-In-Batches output. |
| `near-completion` | `templateKey: "engagement.near-completion"`, body mapped from the webhook payload. |

Field-mapping example for the `certificate` workflow:

```json
{
  "templateKey": "course.certificate",
  "toEmail": "={{ $json.user.email }}",
  "userId":  "={{ $json.user.id }}",
  "payload": {
    "studentName":       "={{ $json.user.name }}",
    "courseTitle":       "={{ $json.course.title }}",
    "instructorName":    "={{ $json.course.instructorName }}",
    "certificatePdfUrl": "={{ $json.certificatePdfUrl }}",
    "unsubscribeUrl":    "={{ $env.BASE_URL }}/unsubscribe?token={{ $json.user.unsubscribeToken }}"
  }
}
```

Configure the HTTP node's retry policy: 3 retries, exponential backoff (1s, 5s, 25s) — same numbers as ADR-014's outbound emitter. n8n owns retry.

Re-export each workflow JSON and `pnpm sync:n8n` to upload.

---

## Step 11 — Preview & local manual test

```bash
pnpm email:dev               # http://localhost:3001 — preview all 7 templates with PreviewProps
pnpm dev                     # http://localhost:3000
```

Force a verify-email:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"you+test@example.com","password":"correct horse battery","name":"Test"}'
```

Check the Resend test dashboard for the accepted send.

Manual lifecycle send:

```bash
curl -X POST http://localhost:3000/api/emails/send \
  -H "Authorization: Bearer $N8N_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "templateKey": "course.certificate",
    "toEmail": "you+test@example.com",
    "userId": "<seeded userId>",
    "payload": { "studentName": "Ada", "courseTitle": "Demo",
                 "instructorName": "Alan",
                 "certificatePdfUrl": "https://learnix.app/api/certificates/enr_demo?token=demo",
                 "unsubscribeUrl": "https://learnix.app/unsubscribe?token=demo" }
  }'
```

---

## Step 12 — Docs

- `docs/adr/015-resend-react-email-outbox.md` — written.
- `docs/specs/roadmap.md` — append Phase 13 entry under Phase 12.
- `docs/README.md` — link this spec and ADR-015.
- When ADR-014 is authored, add a one-line note: *"§ Resend send is delegated to ADR-015's `POST /api/emails/send`."*