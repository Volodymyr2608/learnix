"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import AuthFormHeader from "@/app/_components/Auth/AuthFormHeader";
import type { CheckEmailMessageProps } from "@/app/_components/Auth/ForgotPasswordForm/components/CheckEmailMessage/types";
import { formatCountdown } from "@/lib/utils/formatCountdown";

const CheckEmailMessage = ({
	isPending,
	secondsLeft,
	onResend,
}: CheckEmailMessageProps) => (
	<div className="w-full space-y-6">
		<AuthFormHeader
			description="If an account exists for that email address, you'll receive a password reset link shortly."
			title="Check your email"
		/>

		<Button
			className="w-full"
			disabled={secondsLeft > 0 || isPending}
			onClick={onResend}
			variant="outline"
		>
			{isPending ? (
				<>
					<Loader2 className="animate-spin" />
					Sending...
				</>
			) : secondsLeft > 0 ? (
				`Resend in ${formatCountdown(secondsLeft)}`
			) : (
				"Resend reset link"
			)}
		</Button>

		<p className="text-center text-muted-foreground text-sm">
			<Link className="text-primary hover:underline" href="/sign-in">
				Back to sign in
			</Link>
		</p>
	</div>
);

export default CheckEmailMessage;
