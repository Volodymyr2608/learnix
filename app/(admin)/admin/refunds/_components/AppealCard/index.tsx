import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { EvidenceFileList } from "@/app/_components/Billing/components/RefundPage/components/EvidenceFileList";
import { REFUND_REASON_LABEL } from "@/server/entities/refund/refundLabels";
import { ApproveButton } from "../ApproveButton";
import { DenyDialog } from "../DenyDialog";
import type { AppealCardProps } from "./types";
import {
	appealKindLabel,
	approveBlockedText,
	daysLeftLabel,
	snapshotSummary,
} from "./utils";

/** FR-A1: one appeal — reason, text and evidence as text, the snapshot, days left, the decision. */
export const AppealCard = ({ appeal }: AppealCardProps) => (
	<Card>
		<CardHeader className="space-y-1">
			<CardTitle className="text-base">
				{appeal.courseTitle} · {appeal.studentName}
			</CardTitle>
			<p className="text-muted-foreground text-sm">
				{appealKindLabel(appeal.kind, appeal.exceededCondition)} ·{" "}
				{daysLeftLabel(appeal.daysLeft)}
			</p>
		</CardHeader>
		<CardContent className="space-y-3 text-sm">
			<p>
				<span className="font-medium">Reason:</span>{" "}
				{REFUND_REASON_LABEL[
					appeal.reason as keyof typeof REFUND_REASON_LABEL
				] ?? appeal.reason}
			</p>
			<p className="whitespace-pre-wrap break-words">{appeal.text}</p>
			<EvidenceFileList files={appeal.files} />
			<p className="text-muted-foreground">
				{snapshotSummary(appeal.snapshot)}
			</p>
			<div className="flex items-start gap-3">
				<ApproveButton
					appealId={appeal.appealId}
					blockedReason={approveBlockedText(appeal.approveBlockedBy)}
				/>
				<DenyDialog appealId={appeal.appealId} />
			</div>
		</CardContent>
	</Card>
);
