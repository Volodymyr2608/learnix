"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/server/better-auth/client";
import type { ForgotPasswordData } from "@/server/entities/user";

const RESEND_COOLDOWN_S = 180;

const useForgotPassword = () => {
	const [isPending, setIsPending] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [secondsLeft, setSecondsLeft] = useState(0);
	const lastEmailRef = useRef("");

	useEffect(() => {
		if (secondsLeft <= 0) return;
		const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
		return () => clearInterval(id);
	}, [secondsLeft]);

	const send = async ({ email }: ForgotPasswordData) => {
		setIsPending(true);
		// Fire-and-forget: always show generic confirmation to prevent enumeration (ADR-017)
		await authClient.requestPasswordReset({
			email,
			redirectTo: "/reset-password",
		});
		lastEmailRef.current = email;
		setIsPending(false);
		setSubmitted(true);
		setSecondsLeft(RESEND_COOLDOWN_S);
	};

	const resend = () => send({ email: lastEmailRef.current });

	return { isPending, submitted, secondsLeft, handleSubmit: send, resend };
};

export default useForgotPassword;
