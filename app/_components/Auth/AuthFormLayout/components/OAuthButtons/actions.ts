"use server";

import { redirect } from "next/navigation";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { auth } from "@/server/better-auth";

export const googleAction = async () => {
	const res = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL: INSTRUCTOR_URLS.dashboard,
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
			callbackURL: INSTRUCTOR_URLS.dashboard,
		},
	});
	if (!res.url) {
		throw new Error("No URL returned from signInSocial");
	}
	redirect(res.url);
};
