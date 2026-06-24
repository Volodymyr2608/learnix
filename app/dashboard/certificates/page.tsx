import { Award } from "lucide-react";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import CertificatesEmptyState from "@/app/_components/Certificate/components/CertificatesEmptyState";
import CertificatesList from "@/app/_components/Certificate/components/CertificatesList";
import type { CertificateListItem } from "@/app/_components/Certificate/components/CertificatesList/types";
import { env } from "@/lib/env";
import { signCertificateToken } from "@/server/services/notifications/auth";
import { api } from "@/trpc/server";

export default async function CertificatesPage() {
	const earned = await api.certificate.listEarned();

	const items: CertificateListItem[] = await Promise.all(
		earned.map(async (cert) => {
			const token = await signCertificateToken(cert.enrollmentId);
			return {
				enrollmentId: cert.enrollmentId,
				courseTitle: cert.courseTitle,
				instructorName: cert.instructorName,
				completedAt: cert.completedAt,
				downloadUrl: `${env.BASE_URL}/api/certificates/${cert.enrollmentId}?token=${token}`,
			};
		}),
	);

	return (
		<PageShell
			description="Download certificates for the courses you've completed."
			icon={Award}
			iconClassName="bg-gradient-to-br from-amber-400 to-amber-600"
			title="My Certificates"
		>
			{items.length === 0 && <CertificatesEmptyState />}
			{items.length > 0 && <CertificatesList items={items} />}
		</PageShell>
	);
}
