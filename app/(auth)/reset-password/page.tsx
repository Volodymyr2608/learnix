import { Suspense } from "react";
import AuthLayout from "@/app/_components/_shared/components/Layouts/AuthLayout";
import ResetPasswordForm from "@/app/_components/Auth/ResetPasswordForm";
import { APP_NAME } from "@/lib/constants/projectName";

const author = {
	name: "James Wilson",
	position: "Product Manager",
	quote: `"${APP_NAME} helped me stay current with industry trends. The courses are practical and immediately applicable."`,
};

const ResetPasswordPage = () => {
	return (
		<AuthLayout author={author}>
			<Suspense>
				<ResetPasswordForm />
			</Suspense>
		</AuthLayout>
	);
};

export default ResetPasswordPage;
