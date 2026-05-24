import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
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
	user: {
		additionalFields: {
			role: {
				type: "string",
				input: false,
			},
		},
	},
});

export type Session = typeof auth.$Infer.Session;
