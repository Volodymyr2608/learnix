import AuthFormHeader from "@/app/_components/Auth/AuthFormHeader";
import OAuthButtons from "@/app/_components/Auth/AuthFormLayout/components/OAuthButtons";
import SeparatorBlock from "@/app/_components/Auth/AuthFormLayout/components/SeparatorBlock";
import type { AuthFormLayoutProps } from "@/app/_components/Auth/AuthFormLayout/types";

const AuthFormLayout = ({
	children,
	title,
	description,
}: AuthFormLayoutProps) => {
	return (
		<div className="w-full space-y-6">
			<AuthFormHeader description={description} title={title} />

			<OAuthButtons />
			<SeparatorBlock />

			{children}
		</div>
	);
};

export default AuthFormLayout;
