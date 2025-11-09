"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/server/better-auth";

export const googleAction = async () => {
	const res = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL: "/",
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
			callbackURL: "/",
		},
	});
	if (!res.url) {
		throw new Error("No URL returned from signInSocial");
	}
	redirect(res.url);
};
