import { Award } from "lucide-react";

const CertificatesEmptyState = () => {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-border border-dashed bg-card py-20 text-center">
			<div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-amber-600/20 ring-1 ring-amber-500/20">
				<Award className="h-8 w-8 text-amber-500" />
			</div>
			<h2 className="mt-5 font-semibold text-lg">No certificates yet</h2>
			<p className="mt-1.5 max-w-sm text-muted-foreground text-sm">
				Complete a course and your certificate will appear here, ready to
				download.
			</p>
		</div>
	);
};

export default CertificatesEmptyState;
