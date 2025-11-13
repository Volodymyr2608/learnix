import { useRouter } from "next/navigation";

import { toast } from "sonner";
import type { SignUpData } from "@/server/entities/user";
import { api } from "@/trpc/client";

const useSignUp = () => {
	const router = useRouter();
	const signup = api.user.signUp.useMutation({
		onSuccess: () => {
			toast("Account created successfully.");

			setTimeout(() => {
				router.push("/sign-in");
			}, 2000);
		},
		onError: () => {
			toast.error("Failed to create account. Please try again later.");
		},
	});

	const handleSubmit = async (data: SignUpData) => {
		await signup.mutateAsync(data);
	};

	return { handleSubmit, isPending: signup.isPending };
};

export default useSignUp;
