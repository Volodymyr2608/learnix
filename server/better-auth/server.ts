import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./index";

export type Session = typeof auth.$Infer.Session;

export const getSession = cache(
	async (): Promise<Session | null> =>
		auth.api.getSession({ headers: await headers() }),
);
