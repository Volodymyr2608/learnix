import type { EvidenceFileView } from "@/server/entities/refund/refundView.dto";

export type AdminDecisionProps = {
	reason: string;
	files: EvidenceFileView[];
};
