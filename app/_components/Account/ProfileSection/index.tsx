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
import useProfileForm from "@/app/_components/Account/ProfileSection/hooks/useProfileForm";
import { authClient } from "@/server/better-auth/client";

const ProfileSection = () => {
	const { data: session } = authClient.useSession();
	const user = session?.user;

	const { control, onSubmit, isPending, isDirty } = useProfileForm(
		user?.name ?? "",
		user?.image ?? null,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Profile</CardTitle>
				<CardDescription>
					Update your display name and avatar URL.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="max-w-md space-y-3" onSubmit={onSubmit}>
					<FieldGroup className="gap-4">
						<ControlledField
							control={control}
							label="Full name"
							name="name"
							placeholder="Your name"
						/>
						<ControlledField
							control={control}
							label="Avatar URL"
							name="image"
							placeholder="https://..."
						/>
					</FieldGroup>

					<Button disabled={isPending || !isDirty} type="submit">
						{isPending ? <Loader2 className="animate-spin" /> : null}
						Save changes
					</Button>
				</form>
			</CardContent>
		</Card>
	);
};

export default ProfileSection;
