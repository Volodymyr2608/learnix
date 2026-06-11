import AuthLayout from "@/app/_components/_shared/components/Layouts/AuthLayout";
import ForgotPasswordForm from "@/app/_components/Auth/ForgotPasswordForm";
import { APP_NAME } from "@/lib/constants/projectName";

const author = {
	name: "James Wilson",
	position: "Product Manager",
	quote: `"${APP_NAME} helped me stay current with industry trends. The courses are practical and immediately applicable."`,
};

const ForgotPasswordPage = () => {
	return (
		<AuthLayout author={author}>
			<ForgotPasswordForm />
		</AuthLayout>
	);
};

export default ForgotPasswordPage;
