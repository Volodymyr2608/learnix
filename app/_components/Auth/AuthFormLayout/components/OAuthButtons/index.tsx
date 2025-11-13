import { Button } from "@/app/_components/_shared/ui/button";
import {
	githubAction,
	googleAction,
} from "@/app/_components/Auth/AuthFormLayout/components/OAuthButtons/actions";
import GitHubIcon from "@/assets/icons/GitHubIcon";
import GoogleIcon from "@/assets/icons/GoogleIcon";

const OAuthButtons = () => {
	return (
		<form className="flex flex-col gap-y-4">
			<Button
				className="w-full cursor-pointer bg-transparent"
				formAction={googleAction}
				variant="outline"
			>
				<GoogleIcon />
				Continue with Google
			</Button>

			<Button
				className="w-full cursor-pointer bg-transparent"
				formAction={githubAction}
				variant="outline"
			>
				<GitHubIcon />
				Continue with Github
			</Button>
		</form>
	);
};

export default OAuthButtons;
