import { EvidenceFileList } from "../EvidenceFileList";
import type { AdminDecisionProps } from "./types";

/** FR-S18: the admin's denial reason (as text) and any files they attached. Final. */
export const AdminDecision = ({ reason, files }: AdminDecisionProps) => (
	<div className="space-y-2 rounded-lg border p-4 text-sm">
		<p className="font-medium">
			An admin reviewed your appeal and did not approve it.
		</p>
		<p className="whitespace-pre-wrap break-words">{reason}</p>
		<EvidenceFileList files={files} />
	</div>
);
