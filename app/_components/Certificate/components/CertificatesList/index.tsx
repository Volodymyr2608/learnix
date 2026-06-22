import { Download } from "lucide-react";
import type {
	CertificateRowProps,
	CertificatesListProps,
} from "@/app/_components/Certificate/components/CertificatesList/types";

function CertificateRow({ item }: CertificateRowProps) {
	return (
		<div className="flex items-center justify-between rounded-lg border border-border p-4">
			<div>
				<h3 className="font-medium">{item.courseTitle}</h3>
				<p className="text-muted-foreground text-sm">
					{item.instructorName} ·{" "}
					{item.completedAt.toLocaleDateString(undefined, {
						year: "numeric",
						month: "long",
						day: "numeric",
					})}
				</p>
			</div>
			<a
				className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
				download
				href={item.downloadUrl}
			>
				<Download className="h-4 w-4" />
				Download
			</a>
		</div>
	);
}

const CertificatesList = ({ items }: CertificatesListProps) => {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<CertificateRow item={item} key={item.enrollmentId} />
			))}
		</div>
	);
};

export default CertificatesList;
