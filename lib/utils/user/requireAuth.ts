import { redirect } from "next/navigation";
import AUTH_URLS from "@/lib/constants/urls/authUrls";
import type { Session } from "@/server/better-auth/server";

const requireAuth = (
	session: Session | null,
	redirectTo = AUTH_URLS.SIGN_IN,
) => {
	if (!session?.user) {
		redirect(redirectTo);
	}

	return session as Session & { user: NonNullable<Session["user"]> };
};

export default requireAuth;
