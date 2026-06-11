import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/server/better-auth/client";
import { emailSchema } from "@/server/entities/base";

const changeEmailSchema = z.object({ newEmail: emailSchema });
type ChangeEmailData = z.infer<typeof changeEmailSchema>;

const useEmailForm = () => {
	const [isPending, setIsPending] = useState(false);
	const [sent, setSent] = useState(false);

	const { control, handleSubmit, reset } = useForm<ChangeEmailData>({
		resolver: zodResolver(changeEmailSchema),
		defaultValues: { newEmail: "" },
	});

	const onSubmit = handleSubmit(async ({ newEmail }) => {
		setIsPending(true);
		const { error } = await authClient.changeEmail({
			newEmail,
			callbackURL: "/dashboard/settings",
		});
		setIsPending(false);
		if (error) {
			toast.error(error.message ?? "Failed to request email change.");
			return;
		}
		toast.success("Confirmation email sent to your current address.");
		setSent(true);
		reset();
	});

	return { control, onSubmit, isPending, sent };
};

export default useEmailForm;
