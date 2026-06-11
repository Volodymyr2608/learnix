"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import useResetPassword from "@/app/_components/Auth/ResetPasswordForm/hooks/useResetPassword";
import {
	doesPasswordMatch,
	onPasswordMismatch,
} from "@/lib/utils/doesPasswordMatch";
import { passwordSchema } from "@/server/entities/base";

const resetPasswordSchema = z
	.object({ newPassword: passwordSchema, confirmPassword: passwordSchema })
	.refine(
		({ newPassword, confirmPassword }) =>
			doesPasswordMatch({ password: newPassword, confirmPassword }),
		{ ...onPasswordMismatch, path: ["confirmPassword"] },
	);

type ResetPasswordData = z.infer<typeof resetPasswordSchema>;

const ResetPasswordForm = () => {
	const searchParams = useSearchParams();
	const token = searchParams.get("token");
	const { isPending, error, handleSubmit: onSubmit } = useResetPassword();

	const { handleSubmit, control } = useForm<ResetPasswordData>({
		resolver: zodResolver(resetPasswordSchema),
		defaultValues: { newPassword: "", confirmPassword: "" },
	});

	if (!token) {
		return (
			<div className="w-full space-y-6">
				<div className="space-y-2 text-center">
					<h1 className="font-bold text-3xl">Invalid link</h1>
					<p className="text-muted-foreground">
						This reset link is missing or invalid.{" "}
						<Link
							className="text-primary hover:underline"
							href="/forgot-password"
						>
							Request a new one.
						</Link>
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full space-y-6">
			<div className="space-y-2 text-center">
				<h1 className="font-bold text-3xl">Set new password</h1>
				<p className="text-muted-foreground">Choose a strong new password.</p>
			</div>

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
