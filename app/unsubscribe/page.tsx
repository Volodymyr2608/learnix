import { userRepository } from "@/server/repositories/user.repository";
import { verifyUnsubscribeToken } from "@/server/services/email/unsubscribe-token";

export default async function UnsubscribePage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;

	if (!token) {
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
		const { userId } = await verifyUnsubscribeToken(token);
		await userRepository.update(userId, { emailNotificationsEnabled: false });

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
}
