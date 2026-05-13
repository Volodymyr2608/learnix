import { redirect } from "next/navigation";
import DashboardLayout from "@/app/_components/Dashboard/Layout";
import { Role } from "@/generated/prisma";
import { env } from "@/lib/env";
import { getSession } from "@/server/better-auth/server";
import { userRepository } from "@/server/repositories/user.repository";
import { emailService } from "@/server/services/email/email.service";
import { signUnsubscribeToken } from "@/server/services/email/unsubscribe-token";
import { logger } from "@/server/utils/logger";

const DashboardRootLayout = async ({
	children,
}: {
	children: React.ReactNode;
}) => {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	if (session.user.role !== Role.STUDENT) {
		redirect("/dashboard");
	}

	if (session.user.emailVerified) {
		const user = await userRepository.findFirst({
			where: { id: session.user.id },
			select: { welcomeEmailSentAt: true, email: true, name: true },
		});
		if (user && !user.welcomeEmailSentAt) {
			void (async () => {
				try {
					const updated = await userRepository.updateMany(
						{ id: session.user.id, welcomeEmailSentAt: null },
						{ welcomeEmailSentAt: new Date() },
					);
					if (updated === 1) {
						const token = await signUnsubscribeToken(session.user.id);
						await emailService.send({
							templateKey: "user.welcome",
							toEmail: user.email,
							userId: session.user.id,
							payload: {
								name: user.name ?? user.email,
								browseUrl: `${env.BASE_URL}/dashboard/browse`,
								unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${token}`,
							},
						});
					}
				} catch (err) {
					logger.error("welcome email failed", { error: err });
				}
			})();
		}
	}

	return <DashboardLayout>{children}</DashboardLayout>;
};

export default DashboardRootLayout;