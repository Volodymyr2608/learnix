"use server";

import { redirect } from "next/navigation";
import DASHBOARD_URLS from "@/lib/constants/urls/dashboardUrls";
import { auth } from "@/server/better-auth";

export const googleAction = async () => {
	const res = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL: DASHBOARD_URLS.dashboard,
		},
	});
	if (!res.url) {
		throw new Error("No URL returned from signInSocial");
	}
	redirect(res.url);
};

export const githubAction = async () => {
	const res = await auth.api.signInSocial({
		body: {
			provider: "github",
			callbackURL: DASHBOARD_URLS.dashboard,
		},
	});
	if (!res.url) {
		throw new Error("No URL returned from signInSocial");
	}
	redirect(res.url);
};
