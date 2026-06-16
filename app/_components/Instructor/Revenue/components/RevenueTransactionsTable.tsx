"use client";

import { format } from "date-fns";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/_components/_shared/ui/table";
import { formatUsd } from "@/lib/formatUsd";
import { STATUS_CLASS, STATUS_LABEL } from "../helpers";
import type { RevenueTransactionsTableProps } from "../types";

export default function RevenueTransactionsTable({
	transactions,
	isLoading,
}: RevenueTransactionsTableProps) {
	const hasRows = !!transactions && transactions.length > 0;
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Recent Transactions</h2>
				<p className="text-muted-foreground text-sm">
					Your latest course sales
				</p>
			</div>
			{isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
			{!isLoading && !hasRows && (
				<p className="text-muted-foreground text-sm">No sales yet.</p>
			)}
			{!isLoading && hasRows && (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Course</TableHead>
							<TableHead>Student</TableHead>
							<TableHead>Date</TableHead>
							<TableHead className="text-right">Amount</TableHead>
							<TableHead className="text-right">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{transactions.map((txn) => (
							<TableRow key={txn.id}>
								<TableCell className="font-medium">{txn.courseTitle}</TableCell>
								<TableCell>{txn.studentName}</TableCell>
								<TableCell className="text-muted-foreground">
									{format(txn.createdAt, "MMM d, yyyy")}
								</TableCell>
								<TableCell className="text-right font-semibold">
									{formatUsd(txn.amountCents)}
								</TableCell>
								<TableCell className="text-right">
									<Badge
										className={STATUS_CLASS[txn.status]}
										variant="secondary"
									>
										{STATUS_LABEL[txn.status]}
									</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Card>
	);
}
