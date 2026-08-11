import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import {
	anonymiseOnAccountDeletion,
	preventUserRowDeletion,
} from "@/server/better-auth/accountDeletion.hooks";
import { db } from "@/server/db";
import { emailService } from "@/server/services/email/email.service";
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
	databaseHooks: {
		user: {
			// Returning exactly `false` makes Better Auth skip the underlying
			// `DELETE FROM users` (dist/db/with-hooks.mjs:101-108). The row is retained;
			// `beforeDelete` above has already anonymised it.
			delete: { before: preventUserRowDeletion },
		},
	},
	user: {
		additionalFields: {
			role: {
				type: "string",
				input: false,
			},
		},
		changeEmail: {
			enabled: true,
			// Confirmation sent to CURRENT email for security (ADR-017)
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
			// Anonymise in place instead of deleting. This hook cannot stop the row
			// delete on its own — `databaseHooks.user.delete.before` below does that —
			// but it runs first, owns the atomic transaction, and aborts the whole
			// request if it throws.
			//
			// The previous `beforeDelete` here soft-deleted the instructor's courses.
			// It was a no-op: the FK cascade removed those same courses moments later.
			// Do not reinstate that pattern — courses are now retained outright.
			beforeDelete: anonymiseOnAccountDeletion,
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
