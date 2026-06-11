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
import useEmailForm from "@/app/_components/Account/EmailSection/hooks/useEmailForm";
import { authClient } from "@/server/better-auth/client";

const EmailSection = () => {
	const { data: session } = authClient.useSession();
	const { control, onSubmit, isPending, sent } = useEmailForm();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Email address</CardTitle>
				<CardDescription>
					Current:{" "}
					<span className="font-medium text-foreground">
						{session?.user.email}
					</span>
				</CardDescription>
			</CardHeader>
			<CardContent>
				{sent ? (
					<p className="text-muted-foreground text-sm">
						Check your current inbox to confirm the change. The email won't
						update until you click the link.
					</p>
				) : (
					<form className="max-w-md space-y-3" onSubmit={onSubmit}>
						<FieldGroup>
							<ControlledField
								control={control}
								label="New email address"
								name="newEmail"
								placeholder="new@example.com"
							/>
						</FieldGroup>
						<Button disabled={isPending} type="submit">
							{isPending ? <Loader2 className="animate-spin" /> : null}
							Request email change
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
};

export default EmailSection;
