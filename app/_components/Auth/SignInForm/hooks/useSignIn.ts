import { useRouter } from "next/navigation";
import { toast } from "sonner";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { authClient } from "@/server/better-auth/client";
import type { SignUpData } from "@/server/entities/user";

const useSignIn = () => {
	const router = useRouter();

	const handleSubmit = async (userPayload: SignUpData) => {
		const { error } = await authClient.signIn.email(userPayload);

		if (error) {
			toast.error("Failed to sign in. Please try again later.");
			return;
		}

		router.push(INSTRUCTOR_URLS.dashboard);
	};

	return { handleSubmit, isPending: false };
};

export default useSignIn;
