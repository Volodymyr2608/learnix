"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import useForgotPassword from "@/app/_components/Auth/ForgotPasswordForm/hooks/useForgotPassword";
import { emailSchema } from "@/server/entities/base";

const forgotPasswordSchema = z.object({ email: emailSchema });
type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>;

const ForgotPasswordForm = () => {
	const { isPending, submitted, handleSubmit: onSubmit } = useForgotPassword();

	const { handleSubmit, control } = useForm<ForgotPasswordData>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: { email: "" },
	});

	if (submitted) {
		return (
			<div className="w-full space-y-6">
				<div className="space-y-2 text-center">
					<h1 className="font-bold text-3xl">Check your email</h1>
					<p className="text-muted-foreground">
						If an account exists for that email address, you'll receive a
						password reset link shortly.
					</p>
				</div>
				<p className="text-center text-muted-foreground text-sm">
					<Link className="text-primary hover:underline" href="/sign-in">
						Back to sign in
					</Link>
				</p>
			</div>
		);
	}

	return (
		<div className="w-full space-y-6">
			<div className="space-y-2 text-center">
				<h1 className="font-bold text-3xl">Forgot password?</h1>
				<p className="text-muted-foreground">
					Enter your email and we'll send you a reset link.
				</p>
			</div>

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
