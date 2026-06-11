"use client";

import { Loader2 } from "lucide-react";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { FieldGroup } from "@/app/_components/_shared/ui/field";
import usePasswordForm from "@/app/_components/Account/PasswordSection/hooks/usePasswordForm";

const PasswordSection = () => {
	const { control, onSubmit, isPending } = usePasswordForm();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Password</CardTitle>
				<CardDescription>
					Change your password. Other active sessions will be signed out.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="max-w-md space-y-3" onSubmit={onSubmit}>
					<FieldGroup className="gap-4">
						<ControlledField
							control={control}
							label="Current password"
							name="currentPassword"
							placeholder="••••••••"
							type="password"
						/>
						<ControlledField
							control={control}
							label="New password"
							name="newPassword"
							placeholder="••••••••"
							type="password"
						/>
						<ControlledField
							control={control}
							label="Confirm new password"
							name="confirmPassword"
							placeholder="••••••••"
							type="password"
						/>
					</FieldGroup>

					<Button disabled={isPending} type="submit">
						{isPending ? <Loader2 className="animate-spin" /> : null}
						Change password
					</Button>
				</form>
			</CardContent>
		</Card>
	);
};

export default PasswordSection;
