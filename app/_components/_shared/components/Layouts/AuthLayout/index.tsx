import type { AuthLayoutProps } from "@/app/_components/_shared/components/Layouts/AuthLayout/types";
import Logo from "@/app/_components/_shared/components/Logo";

const AuthLayout = ({ children, author }: AuthLayoutProps) => {
	return (
		<div className="flex min-h-screen">
			<div className="flex w-full flex-col justify-center px-4 py-12 sm:px-6 lg:w-1/2 lg:px-20 xl:px-24">
				<div className="mx-auto w-full max-w-sm">
					<div className="mb-8">
						<Logo />
					</div>

					{children}
				</div>
			</div>

			<div className="relative hidden lg:block lg:w-1/2">
				<div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary" />
				<div className="relative flex h-full flex-col justify-center px-12 text-white">
					<blockquote className="space-y-4">
						<p className="text-balance font-medium text-2xl leading-relaxed">
							{author.quote}
						</p>
						<footer className="text-lg">
							<div className="font-semibold">{author.name}</div>
							<div className="text-white/80">{author.position}</div>
						</footer>
					</blockquote>
				</div>
			</div>
		</div>
	);
};

export default AuthLayout;
