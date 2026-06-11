"use client";

import { useState } from "react";
import { authClient } from "@/server/better-auth/client";

const useForgotPassword = () => {
	const [isPending, setIsPending] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = async ({ email }: { email: string }) => {
		setIsPending(true);
		// Fire-and-forget: always show generic confirmation to prevent enumeration (ADR-017)
		await authClient.requestPasswordReset({
			email,
			redirectTo: "/reset-password",
		});
		setIsPending(false);
		setSubmitted(true);
	};

	return { handleSubmit, isPending, submitted };
};

export default useForgotPassword;
