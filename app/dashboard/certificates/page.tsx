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
		<div className="mx-auto max-w-3xl px-4 py-8">
			<h1 className="font-bold text-2xl">My Certificates</h1>
			<p className="mt-1 text-muted-foreground">
				Download certificates for the courses you've completed.
			</p>
			<div className="mt-6">
				{items.length === 0 && <CertificatesEmptyState />}
				{items.length > 0 && <CertificatesList items={items} />}
			</div>
		</div>
	);
}
