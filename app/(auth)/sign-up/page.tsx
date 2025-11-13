import AuthLayout from "@/app/_components/_shared/Layouts/AuthLayout";
import SignUpForm from "@/app/_components/Auth/SignUpForm";
import { APP_NAME } from "@/lib/constants/projectName";

const author = {
	name: "Michael Chen",
	position: "Product Designer",
	quote: `"Join thousands of learners who are advancing their careers and achieving their goals with ${APP_NAME}"`,
};

const SignUpPage = () => {
	return (
		<AuthLayout author={author}>
			<SignUpForm />
		</AuthLayout>
	);
};

export default SignUpPage;
