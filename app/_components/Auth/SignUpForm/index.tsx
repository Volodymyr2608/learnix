"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import FormField from "@/app/_components/_shared/Form/FormField";
import { Button } from "@/app/_components/_shared/ui/button";
import AuthFormLayout from "@/app/_components/Auth/AuthFormLayout";

const SignUpForm = () => {
	const isPending = false;

	return (
		<AuthFormLayout
			description="Start your learning journey today"
			title="Create an account"
		>
			<form className="space-y-3">
				<FormField
					label="Full Name"
					name="name"
					placeholder="John Doe"
					// error={state.errors?.name?.errors[0]}
				/>
				<FormField
					label="Email"
					name="email"
					placeholder="name@example.com"
					// error={state.errors?.email?.errors[0]}
				/>
				<FormField
					label="Password"
					name="password"
					placeholder="••••••••"
					type="password"
					// error={state.errors?.password?.errors[0]}
				/>
				<FormField
					label="Confirm Password"
					name="confirmPassword"
					placeholder="••••••••"
					type="password"
					// error={state.errors?.confirmPassword?.errors[0]}
				/>
				<Button className="w-full" disabled={isPending} type="submit">
					{isPending ? (
						<>
							<Loader2 className="animate-spin" />
							Creating account...
						</>
					) : (
						"Create account"
					)}
				</Button>
			</form>

			<p className="text-center text-muted-foreground text-sm">
				Already have an account?{" "}
				<Link className="text-primary hover:underline" href="/sign-in">
					Sign in
				</Link>
			</p>
		</AuthFormLayout>
	);
};

export default SignUpForm;
