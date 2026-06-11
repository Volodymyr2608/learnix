"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import AuthFormHeader from "@/app/_components/Auth/AuthFormHeader";
import CheckEmailMessage from "@/app/_components/Auth/ForgotPasswordForm/components/CheckEmailMessage";
import useForgotPassword from "@/app/_components/Auth/ForgotPasswordForm/hooks/useForgotPassword";
import {
	type ForgotPasswordData,
	forgotPasswordSchema,
} from "@/server/entities/user";

const ForgotPasswordForm = () => {
	const {
		isPending,
		submitted,
		secondsLeft,
		handleSubmit: onSubmit,
		resend,
	} = useForgotPassword();

	const { handleSubmit, control } = useForm<ForgotPasswordData>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: { email: "" },
	});

	if (submitted) {
		return (
			<CheckEmailMessage
				isPending={isPending}
				onResend={resend}
				secondsLeft={secondsLeft}
			/>
		);
	}

	return (
		<div className="w-full space-y-6">
			<AuthFormHeader
				description="Enter your email and we'll send you a reset link."
				title="Forgot password?"
			/>

			<form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
				<FieldGroup className="gap-4">
					<ControlledField
						control={control}
						label="Email"
						name="email"
						placeholder="name@example.com"
					/>
				</FieldGroup>

				<Button className="w-full" disabled={isPending} type="submit">
					{isPending ? (
						<>
							<Loader2 className="animate-spin" />
							Sending...
						</>
					) : (
						"Send reset link"
					)}
				</Button>
			</form>

			<p className="text-center text-muted-foreground text-sm">
				<Link className="text-primary hover:underline" href="/sign-in">
					Back to sign in
				</Link>
			</p>
		</div>
	);
};

export default ForgotPasswordForm;
