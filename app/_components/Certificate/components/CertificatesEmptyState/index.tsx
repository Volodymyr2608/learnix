import { Award } from "lucide-react";

const CertificatesEmptyState = () => {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-16 text-center">
			<Award className="mb-4 h-10 w-10 text-muted-foreground" />
			<h2 className="font-semibold text-lg">No certificates yet</h2>
			<p className="mt-1 max-w-sm text-muted-foreground text-sm">
				Complete a course and your certificate will appear here, ready to
				download.
			</p>
		</div>
	);
};

export default CertificatesEmptyState;
