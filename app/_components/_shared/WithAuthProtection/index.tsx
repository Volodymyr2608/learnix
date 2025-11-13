import { redirect } from "next/navigation";
import type { WithAuthProtectionProps } from "@/app/_components/_shared/WithAuthProtection/types";
import AUTH_URLS from "@/lib/constants/urls/authUrls";
import { getSession } from "@/server/better-auth/server";

/**
 * Wrapper for protected pages — ensures user is authenticated.
 * If no session is found, redirects to /sign-in.
 */
export default async function WithAuthProtection({
	children,
	redirectTo = AUTH_URLS.SIGN_IN,
}: WithAuthProtectionProps) {
	const session = await getSession();

	if (!session?.user && redirectTo) {
		redirect(redirectTo);
	}

	return children;
}
