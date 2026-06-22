import { Award } from "lucide-react";
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
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm">
					<Award className="h-6 w-6" />
				</div>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">My Certificates</h1>
					<p className="text-muted-foreground">
						Download certificates for the courses you've completed.
					</p>
				</div>
			</div>
			{items.length === 0 && <CertificatesEmptyState />}
			{items.length > 0 && <CertificatesList items={items} />}
		</div>
	);
}
