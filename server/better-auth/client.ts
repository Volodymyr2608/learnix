import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [
		inferAdditionalFields({
			user: {
				role: {
					type: "string",
				},
			},
		}),
	],
});

export type Session = typeof authClient.$Infer.Session;
