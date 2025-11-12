// import { useRouter } from "next/navigation";

import { toast } from "sonner";
import type { SignUpData } from "@/server/entities/user";
import { api } from "@/trpc/client";

const useSignUp = () => {
	// const router = useRouter();
	const signup = api.user.signUp.useMutation({
		onSuccess: () => {
			// router.push("/dashboard");
			// toast(TOAST_MESSAGES['SEND_VERIFICATION_EMAIL_SUCCESS']);
		},
		onError: (error) => {
			console.log(error);
		},
	});

	const handleSubmit = async (data: SignUpData) => {
		const res = await signup.mutateAsync(data);

		if (!res.success) {
			console.error(res.message, "");
			toast.error(res.message);
			return;
		}

		// router.push("/dashboard");
	};

	return { handleSubmit, isPending: signup.isPending };
};

export default useSignUp;
