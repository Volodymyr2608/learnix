import type { AuthFormHeaderProps } from "@/app/_components/Auth/AuthFormHeader/types";

const AuthFormHeader = ({ title, description }: AuthFormHeaderProps) => (
	<div className="space-y-2 text-center">
		<h1 className="font-bold text-3xl">{title}</h1>
		<p className="text-muted-foreground">{description}</p>
	</div>
);

export default AuthFormHeader;
