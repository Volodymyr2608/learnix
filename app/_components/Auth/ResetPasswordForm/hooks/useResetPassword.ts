import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/server/better-auth/client";

const useResetPassword = () => {
	const router = useRouter();
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async ({
		newPassword,
		token,
	}: {
		newPassword: string;
		token: string;
	}) => {
		setIsPending(true);
		setError(null);
		const { error: err } = await authClient.resetPassword({
			newPassword,
			token,
		});
		setIsPending(false);
		if (err) {
			setError("This link is invalid or has expired.");
			return;
		}
		router.push("/sign-in?reset=true");
	};

	return { handleSubmit, isPending, error };
};

export default useResetPassword;
