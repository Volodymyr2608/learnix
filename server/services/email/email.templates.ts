import type { ComponentType } from "react";
import { z } from "zod";
import { AuthAccountDeletionEmail } from "@/app/_emails/AuthAccountDeletionEmail";
import { AuthEmailChangeEmail } from "@/app/_emails/AuthEmailChangeEmail";
import { AuthPasswordResetEmail } from "@/app/_emails/AuthPasswordResetEmail";
import { AuthVerifyEmail } from "@/app/_emails/AuthVerifyEmail";
import { CourseCertificateEmail } from "@/app/_emails/CourseCertificateEmail";
import { EngagementInactivityEmail } from "@/app/_emails/EngagementInactivityEmail";
import { EngagementNearCompletionEmail } from "@/app/_emails/EngagementNearCompletionEmail";
import { EnrollmentConfirmedEmail } from "@/app/_emails/EnrollmentConfirmedEmail";
import { InstructorWelcomeEmail } from "@/app/_emails/InstructorWelcomeEmail";
import { MessageNewEmail } from "@/app/_emails/MessageNewEmail";
import { UserWelcomeEmail } from "@/app/_emails/UserWelcomeEmail";

type TemplateEntry<P> = {
	component: ComponentType<P>;
	payload: z.ZodSchema<P>;
	subject: (p: P) => string;
	criticality: "CRITICAL" | "STANDARD";
};

export const emailTemplates = {
	"auth.verify-email": {
		component: AuthVerifyEmail,
		payload: z.object({ name: z.string(), verifyUrl: z.string().url() }),
		subject: () => "Verify your Learnix email",
		criticality: "CRITICAL",
	},
	"auth.password-reset": {
		component: AuthPasswordResetEmail,
		payload: z.object({ name: z.string(), resetUrl: z.string().url() }),
		subject: () => "Reset your Learnix password",
		criticality: "CRITICAL",
	},
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
	"user.welcome": {
		component: UserWelcomeEmail,
		payload: z.object({
			name: z.string(),
			browseUrl: z.string().url(),
			unsubscribeUrl: z.string().url(),
		}),
		subject: (p) => `Welcome to Learnix, ${p.name}!`,
		criticality: "STANDARD",
	},
	"enrollment.confirmed": {
		component: EnrollmentConfirmedEmail,
		payload: z.object({
			studentName: z.string(),
			courseTitle: z.string(),
			courseUrl: z.string().url(),
			unsubscribeUrl: z.string().url(),
		}),
		subject: (p) => `You're enrolled in ${p.courseTitle}`,
		criticality: "STANDARD",
	},
	"message.new": {
		component: MessageNewEmail,
		payload: z.object({
			recipientName: z.string(),
			senderName: z.string(),
			courseTitle: z.string(),
			messagePreview: z.string(),
			threadUrl: z.url(),
			unsubscribeUrl: z.url(),
		}),
		subject: (p) => `New message from ${p.senderName}`,
		criticality: "STANDARD",
	},
	"course.certificate": {
		component: CourseCertificateEmail,
		payload: z.object({
			studentName: z.string(),
			courseTitle: z.string(),
			instructorName: z.string(),
			certificatePdfUrl: z.url(),
			unsubscribeUrl: z.url(),
		}),
		subject: (p) => `You completed ${p.courseTitle}!`,
		criticality: "STANDARD",
	},
	"engagement.inactivity-7d": {
		component: EngagementInactivityEmail,
		payload: z.object({
			studentName: z.string(),
			courseTitle: z.string(),
			nextLessonTitle: z.string(),
			resumeUrl: z.url(),
			progressPct: z.number(),
			unsubscribeUrl: z.url(),
		}),
		subject: (p) => `Pick up where you left off in ${p.courseTitle}`,
		criticality: "STANDARD",
	},
	"instructor.welcome": {
		component: InstructorWelcomeEmail,
		payload: z.object({
			name: z.string(),
			portalUrl: z.string().url(),
			unsubscribeUrl: z.string().url(),
		}),
		subject: (p) => `Welcome to Learnix, ${p.name}!`,
		criticality: "STANDARD",
	},
	"engagement.near-completion": {
		component: EngagementNearCompletionEmail,
		payload: z.object({
			studentName: z.string(),
			courseTitle: z.string(),
			lessonsRemaining: z.number(),
			nextLessonUrl: z.url(),
			unsubscribeUrl: z.url(),
		}),
		subject: (p) => `${p.lessonsRemaining} lessons left in ${p.courseTitle}`,
		criticality: "STANDARD",
	},
	// biome-ignore lint/suspicious/noExplicitAny: registry requires any for generic constraint
} as const satisfies Record<string, TemplateEntry<any>>;

export type TemplateKey = keyof typeof emailTemplates;
