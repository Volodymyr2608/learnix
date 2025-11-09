import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./index";

export const getSession = cache(async () =>
	auth.api.getSession({ headers: await headers() }),
);
