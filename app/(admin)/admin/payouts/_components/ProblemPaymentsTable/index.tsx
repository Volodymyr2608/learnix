import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/_components/_shared/ui/table";
import { formatPrice } from "@/lib/formatPrice";
import { RetryButton } from "../RetryButton";
import type { ProblemPaymentsTableProps } from "./types";
import { problemRows } from "./utils";

/** FR-A8 / M8: payments an admin can act on, each with its Retry. */
export const ProblemPaymentsTable = ({
	problems,
	now,
}: ProblemPaymentsTableProps) => {
	const rows = problemRows(problems, now);
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No problem payments.</p>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Problem</TableHead>
					<TableHead>Payment</TableHead>
					<TableHead>Amount</TableHead>
					<TableHead>Age</TableHead>
					<TableHead>Detail</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.key}>
						<TableCell>{row.label}</TableCell>
						<TableCell className="font-mono text-xs">{row.paymentId}</TableCell>
						<TableCell>{formatPrice(row.amountCents)}</TableCell>
						<TableCell>{row.age}</TableCell>
						<TableCell className="max-w-xs truncate text-xs">
							{row.detail}
						</TableCell>
						<TableCell>
							<RetryButton kind={row.kind} targetId={row.targetId} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
};
