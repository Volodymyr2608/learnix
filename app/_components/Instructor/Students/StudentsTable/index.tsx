import { Card } from "@/app/_components/_shared/ui/card";
import { StudentsEmptyState } from "./components/StudentsEmptyState";
import { StudentsTablePagination } from "./components/StudentsTablePagination";
import { StudentsTableSkeleton } from "./components/StudentsTableSkeleton";
import { StudentTableRow } from "./components/StudentTableRow";
import { COLUMNS } from "./constants/columns";
import type { StudentsTableProps } from "./types";

export function StudentsTable({
	students,
	isLoading,
	currentPage,
	lastPage,
	onPageChange,
	onViewDetails,
}: StudentsTableProps) {
	const isEmpty = !isLoading && students.length === 0;
	const showPagination = !isLoading && students.length > 0 && lastPage > 1;

	return (
		<Card className="py-0">
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b bg-muted/50">
							{COLUMNS.map((column) => (
								<th
									className="px-6 py-4 text-left font-medium text-muted-foreground text-sm"
									key={column}
								>
									{column}
								</th>
							))}
							<th className="px-6 py-4 text-right font-medium text-muted-foreground text-sm">
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{isLoading && <StudentsTableSkeleton />}
						{!isLoading &&
							students.map((student) => (
								<StudentTableRow
									key={student.id}
									onViewDetails={onViewDetails}
									student={student}
								/>
							))}
					</tbody>
				</table>
			</div>

			{isEmpty && <StudentsEmptyState />}

			{showPagination && (
				<StudentsTablePagination
					currentPage={currentPage}
					lastPage={lastPage}
					onPageChange={onPageChange}
				/>
			)}
		</Card>
	);
}
