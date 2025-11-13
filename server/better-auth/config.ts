import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";
import { env } from "../../lib/env";

export const auth = betterAuth({
	database: prismaAdapter(db, {
		provider: "postgresql", // or "sqlite" or "mysql"
	}),
	emailAndPassword: {
		enabled: true,
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
});

export type Session = typeof auth.$Infer.Session;
