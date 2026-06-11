import Link from "next/link";
import AuthFormHeader from "@/app/_components/Auth/AuthFormHeader";

const InvalidTokenMessage = () => (
	<div className="w-full space-y-6">
		<AuthFormHeader
			description={
				<>
					This reset link is missing or invalid.{" "}
					<Link
						className="text-primary hover:underline"
						href="/forgot-password"
					>
						Request a new one.
					</Link>
				</>
			}
			title="Invalid link"
		/>
	</div>
);

export default InvalidTokenMessage;
