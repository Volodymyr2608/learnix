import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	doesPasswordMatch,
	onPasswordMismatch,
} from "@/lib/utils/doesPasswordMatch";
import { authClient } from "@/server/better-auth/client";
import { passwordSchema } from "@/server/entities/base";

const changePasswordSchema = z
	.object({
		currentPassword: passwordSchema,
		newPassword: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.refine(
		({ newPassword, confirmPassword }) =>
			doesPasswordMatch({ password: newPassword, confirmPassword }),
		{ ...onPasswordMismatch, path: ["confirmPassword"] },
	);

type ChangePasswordData = z.infer<typeof changePasswordSchema>;

const usePasswordForm = () => {
	const [isPending, setIsPending] = useState(false);

	const { control, handleSubmit, reset } = useForm<ChangePasswordData>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
		},
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

	return { control, onSubmit, isPending };
};

export default usePasswordForm;
