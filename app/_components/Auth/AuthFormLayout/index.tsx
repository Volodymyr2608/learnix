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
			<div className="space-y-2 text-center">
				<h1 className="font-bold text-3xl">{title}</h1>
				<p className="text-muted-foreground">{description}</p>
			</div>

			<OAuthButtons />
			<SeparatorBlock />

			{children}
		</div>
	);
};

export default AuthFormLayout;
