import { z } from "zod";
import type { ComponentType } from "react";
import { AuthPasswordResetEmail } from "@/app/_emails/AuthPasswordResetEmail";
import { AuthVerifyEmail } from "@/app/_emails/AuthVerifyEmail";
import { CourseCertificateEmail } from "@/app/_emails/CourseCertificateEmail";
import { EngagementInactivityEmail } from "@/app/_emails/EngagementInactivityEmail";
import { EngagementNearCompletionEmail } from "@/app/_emails/EngagementNearCompletionEmail";
import { EnrollmentConfirmedEmail } from "@/app/_emails/EnrollmentConfirmedEmail";
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
	"course.certificate": {
		component: CourseCertificateEmail,
		payload: z.object({
			studentName: z.string(),
			courseTitle: z.string(),
			instructorName: z.string(),
			certificatePdfUrl: z.string().url(),
			unsubscribeUrl: z.string().url(),
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
			resumeUrl: z.string().url(),
			progressPct: z.number(),
			unsubscribeUrl: z.string().url(),
		}),
		subject: (p) => `Pick up where you left off in ${p.courseTitle}`,
		criticality: "STANDARD",
	},
	"engagement.near-completion": {
		component: EngagementNearCompletionEmail,
		payload: z.object({
			studentName: z.string(),
			courseTitle: z.string(),
			lessonsRemaining: z.number(),
			nextLessonUrl: z.string().url(),
			unsubscribeUrl: z.string().url(),
		}),
		subject: (p) => `${p.lessonsRemaining} lessons left in ${p.courseTitle}`,
		criticality: "STANDARD",
	},
	// biome-ignore lint/suspicious/noExplicitAny: registry requires any for generic constraint
} as const satisfies Record<string, TemplateEntry<any>>;

export type TemplateKey = keyof typeof emailTemplates;