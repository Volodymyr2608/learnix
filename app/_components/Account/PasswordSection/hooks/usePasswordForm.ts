import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { authClient } from "@/server/better-auth/client";
import {
	type ChangePasswordData,
	changePasswordSchema,
} from "@/server/entities/user";

const usePasswordForm = () => {
	const [isPending, setIsPending] = useState(false);

	const {
		control,
		handleSubmit,
		reset,
		formState: { isDirty },
	} = useForm<ChangePasswordData>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: { currentPassword: "", newPassword: "" },
	});

	const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
		setIsPending(true);
		const { error } = await authClient.changePassword({
			currentPassword,
			newPassword,
			revokeOtherSessions: true,
		});
		setIsPending(false);
		if (error) {
			toast.error(
				error.message ??
					"Failed to change password. Check your current password.",
			);
			return;
		}
		toast.success("Password changed. Other sessions have been signed out.");
		reset();
	});

	return { control, onSubmit, isPending, isDirty };
};

export default usePasswordForm;
