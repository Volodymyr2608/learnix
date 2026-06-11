"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import AuthFormHeader from "@/app/_components/Auth/AuthFormHeader";
import InvalidTokenMessage from "@/app/_components/Auth/ResetPasswordForm/components/InvalidTokenMessage";
import useResetPassword from "@/app/_components/Auth/ResetPasswordForm/hooks/useResetPassword";
import {
	type ResetPasswordData,
	resetPasswordSchema,
} from "@/server/entities/user";

const ResetPasswordForm = () => {
	const searchParams = useSearchParams();
	const token = searchParams.get("token");
	const { isPending, error, handleSubmit: onSubmit } = useResetPassword();

	const { handleSubmit, control } = useForm<ResetPasswordData>({
		resolver: zodResolver(resetPasswordSchema),
		defaultValues: { newPassword: "", confirmPassword: "" },
	});

	if (!token) {
		return <InvalidTokenMessage />;
	}

	return (
		<div className="w-full space-y-6">
			<AuthFormHeader
				description="Choose a strong new password."
				title="Set new password"
			/>

			<form
				className="space-y-3"
				onSubmit={handleSubmit(({ newPassword }) =>
					onSubmit({ newPassword, token }),
				)}
			>
				<FieldGroup className="gap-4">
					<ControlledField
						control={control}
						label="New password"
						name="newPassword"
						placeholder="••••••••"
						type="password"
					/>
					<ControlledField
						control={control}
						label="Confirm password"
						name="confirmPassword"
						placeholder="••••••••"
						type="password"
					/>
				</FieldGroup>

				{error && (
					<p className="text-destructive text-sm">
						{error}{" "}
						<Link className="underline" href="/forgot-password">
							Request a new link.
						</Link>
					</p>
				)}

				<Button className="w-full" disabled={isPending} type="submit">
					{isPending ? (
						<>
							<Loader2 className="animate-spin" />
							Saving...
						</>
					) : (
						"Reset password"
					)}
				</Button>
			</form>
		</div>
	);
};

export default ResetPasswordForm;
