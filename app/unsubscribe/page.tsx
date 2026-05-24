import { redirect } from "next/navigation";
import { userRepository } from "@/server/repositories/user.repository";
import { verifyUnsubscribeToken } from "@/server/services/email/unsubscribe-token";

async function confirmUnsubscribe(formData: FormData) {
	"use server";
	const token = formData.get("token") as string;

	try {
		const { userId } = await verifyUnsubscribeToken(token);
		await userRepository.update(userId, { emailNotificationsEnabled: false });
	} catch {
		redirect("/unsubscribe?error=invalid");
	}

	redirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string; done?: string; error?: string }>;
}) {
	const { token, done, error } = await searchParams;

	if (done === "1") {
		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<div className="max-w-md text-center">
					<h1 className="font-bold text-2xl text-gray-900">
						You&apos;ve been unsubscribed
					</h1>
					<p className="mt-2 text-gray-600">
						You will no longer receive notification emails from Learnix.
					</p>
				</div>
			</main>
		);
	}

	if (!token || error) {
		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<div className="max-w-md text-center">
					<h1 className="font-bold text-2xl text-gray-900">Invalid link</h1>
					<p className="mt-2 text-gray-600">
						This unsubscribe link is invalid or has expired.
					</p>
				</div>
			</main>
		);
	}

	try {
		await verifyUnsubscribeToken(token);
	} catch {
		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<div className="max-w-md text-center">
					<h1 className="font-bold text-2xl text-gray-900">Invalid link</h1>
					<p className="mt-2 text-gray-600">
						This unsubscribe link is invalid or has expired.
					</p>
				</div>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen items-center justify-center p-8">
			<div className="max-w-md text-center">
				<h1 className="font-bold text-2xl text-gray-900">
					Unsubscribe from emails?
				</h1>
				<p className="mt-2 text-gray-600">
					You will no longer receive notification emails from Learnix.
				</p>
				<form action={confirmUnsubscribe} className="mt-6">
					<input name="token" type="hidden" value={token} />
					<button
						className="rounded-md bg-red-600 px-6 py-2 font-semibold text-sm text-white hover:bg-red-500"
						type="submit"
					>
						Confirm unsubscribe
					</button>
				</form>
			</div>
		</main>
	);
}
