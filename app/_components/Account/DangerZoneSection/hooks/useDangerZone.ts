import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/server/better-auth/client";

const useDangerZone = () => {
	const router = useRouter();
	const [isPending, setIsPending] = useState(false);
	const [open, setOpen] = useState(false);

	const deleteAccount = async (password: string) => {
		setIsPending(true);
		const { error } = await authClient.deleteUser({
			password,
			callbackURL: "/",
		});
		setIsPending(false);
		if (error) {
			toast.error(
				error.message ??
					"Failed to delete account. Check your password and try again.",
			);
			return;
		}
		setOpen(false);
		await authClient.signOut();
		router.push("/");
	};

	return { open, setOpen, isPending, deleteAccount };
};

export default useDangerZone;
