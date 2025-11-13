import { useRouter } from "next/navigation";

import { toast } from "sonner";
import type { SignUpData } from "@/server/entities/user";
import { api } from "@/trpc/client";

const useSignIn = () => {
	const router = useRouter();
	const signin = api.user.signIn.useMutation({
		onSuccess: () => {
			router.push("/dashboard");
		},
		onError: () => {
			toast.error("Failed to sign in. Please try again later.");
		},
	});

	const handleSubmit = async (data: SignUpData) => {
		await signin.mutateAsync(data);
	};

	return { handleSubmit, isPending: signin.isPending };
};

export default useSignIn;
