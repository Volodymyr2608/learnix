"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import ControlledField from "@/app/_components/_shared/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup, FieldLabel } from "@/app/_components/_shared/ui/field";
import AuthFormLayout from "@/app/_components/Auth/AuthFormLayout";
import useSignIn from "@/app/_components/Auth/SignInForm/hooks/useSignIn";
import { signInSchema } from "@/server/entities/user";

const SignUpForm = () => {
	const { isPending, handleSubmit: onSubmit } = useSignIn();

	const { handleSubmit, control } = useForm({
		resolver: zodResolver(signInSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	return (
		<AuthFormLayout
			description="Sign in to your account to continue learning"
			title="Welcome back"
		>
			<form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
				<FieldGroup className="gap-4">
					<ControlledField
						control={control}
						label="Email"
						name="email"
						placeholder="name@example.com"
					/>
					<ControlledField
						control={control}
						label={
							<div className="flex items-center justify-between">
								<FieldLabel className="leading-none" htmlFor="password">
									Password
								</FieldLabel>
								<Link
									className="text-primary text-sm hover:underline"
									href="/forgot-password"
								>
									Forgot password?
								</Link>
							</div>
						}
						name="password"
						placeholder="••••••••"
						type="password"
					/>
				</FieldGroup>

				<Button className="w-full" disabled={isPending} type="submit">
					{isPending ? (
						<>
							<Loader2 className="animate-spin" />
							Signing in...
						</>
					) : (
						"Sign in"
					)}
				</Button>
			</form>

			<p className="text-center text-muted-foreground text-sm">
				Don't have an account?{" "}
				<Link className="text-primary hover:underline" href="/sign-up">
					Sign up
				</Link>
			</p>
		</AuthFormLayout>
	);
};

export default SignUpForm;
