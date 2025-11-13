import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./index";

type Session = typeof auth.$Infer.Session;

export const getSession = cache(
	async (): Promise<Session> =>
		auth.api.getSession({ headers: await headers() }),
);
