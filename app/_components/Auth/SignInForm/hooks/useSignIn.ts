import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Role } from "@/generated/prisma";
import ADMIN_URLS from "@/lib/constants/urls/adminUrls";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { authClient } from "@/server/better-auth/client";
import type { SignInData } from "@/server/entities/user";

function getRedirectUrl(role: string | undefined): string {
	if (role === Role.ADMIN) return ADMIN_URLS.dashboard;
	if (role === Role.INSTRUCTOR) return INSTRUCTOR_URLS.dashboard;
	return STUDENT_URLS.dashboard;
}

const useSignIn = () => {
	const router = useRouter();

	const handleSubmit = async (userPayload: SignInData) => {
		const { error, data } = await authClient.signIn.email(userPayload);

		if (error) {
			toast.error("Failed to sign in. Please try again later.");
			return;
		}

		router.push(getRedirectUrl(data?.user?.role));
	};

	return { handleSubmit, isPending: false };
};

export default useSignIn;
