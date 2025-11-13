import AuthLayout from "@/app/_components/_shared/Layouts/AuthLayout";
import SignInForm from "@/app/_components/Auth/SignInForm";
import { APP_NAME } from "@/lib/constants/projectName";

const author = {
	name: "Sarah Johnson",
	position: "Software Engineer",
	quote: `"${APP_NAME} has transformed the way I approach learning. The courses are engaging, and the instructors are world-class."`,
};

const SignInPage = () => {
	return (
		<AuthLayout author={author}>
			<SignInForm />
		</AuthLayout>
	);
};

export default SignInPage;
