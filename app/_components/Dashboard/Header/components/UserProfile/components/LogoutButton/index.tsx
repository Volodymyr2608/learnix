import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/app/_components/_shared/ui/button";
import { auth } from "@/server/better-auth";

const LogoutButton = () => {
	const logout = async () => {
		"use server";

		await auth.api.signOut({
			headers: await headers(),
		});

		redirect("/");
	};

	return (
		<form>
			<Button
				className="h-auto w-full cursor-pointer justify-start p-0"
				formAction={logout}
				variant="ghost"
			>
				Logout
			</Button>
		</form>
	);
};

export default LogoutButton;
