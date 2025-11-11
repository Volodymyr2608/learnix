"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import ControlledField from "@/app/_components/_shared/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import AuthFormLayout from "@/app/_components/Auth/AuthFormLayout";
import useSignUp from "@/app/_components/Auth/SignUpForm/hooks/useSignUp";
import { signUpSchema } from "@/server/entities/user";

const SignUpForm = () => {
	const { isPending, handleSubmit: onSubmit } = useSignUp();

	const { handleSubmit, control } = useForm({
		resolver: zodResolver(signUpSchema),
		defaultValues: {
			name: "",
			email: "",
			password: "",
			confirmPassword: "",
		},
	});

	return (
		<AuthFormLayout
			description="Start your learning journey today"
			title="Create an account"
		>
			<form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
				<FieldGroup className="gap-4">
					<ControlledField
						control={control}
						label="Full Name"
						name="name"
						placeholder="John Doe"
					/>
					<ControlledField
						control={control}
						label="Email"
						name="email"
						placeholder="name@example.com"
					/>
					<ControlledField
						control={control}
						label="Password"
						name="password"
						placeholder="••••••••"
						type="password"
					/>
					<ControlledField
						control={control}
						label="Confirm Password"
						name="confirmPassword"
						placeholder="••••••••"
						type="password"
					/>
				</FieldGroup>

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
