import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Role } from "@/generated/prisma";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { authClient } from "@/server/better-auth/client";
import type { SignInData } from "@/server/entities/user";

const useSignIn = () => {
	const router = useRouter();

	const handleSubmit = async (userPayload: SignInData) => {
		const { error, data } = await authClient.signIn.email(userPayload);

		if (error) {
			toast.error("Failed to sign in. Please try again later.");
			return;
		}

		const redirectUrl =
			data?.user?.role === Role.INSTRUCTOR
				? INSTRUCTOR_URLS.dashboard
				: STUDENT_URLS.dashboard;

		router.push(redirectUrl);
	};

	return { handleSubmit, isPending: false };
};

export default useSignIn;
