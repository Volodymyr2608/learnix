import AuthLayout from "@/app/_components/_shared/Layouts/AuthLayout";
import SignUpForm from "@/app/_components/Auth/SignUpForm";
import { APP_NAME } from "@/lib/constants/projectName";

const author = {
	position: "Software Engineer",
	name: "Sarah Johnson",
	quote: `${APP_NAME} has transformed the way I approach learning. The courses are engaging, and the instructors are world-class.`,
};

const SignUpPage = () => {
	return (
		<AuthLayout author={author}>
			<SignUpForm />
		</AuthLayout>
	);
};

export default SignUpPage;
