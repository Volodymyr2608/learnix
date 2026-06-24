import { Button } from "@/app/_components/_shared/ui/button";
import type { StudentsTablePaginationProps } from "./types";

export function StudentsTablePagination({
	currentPage,
	lastPage,
	onPageChange,
}: StudentsTablePaginationProps) {
	return (
		<div className="flex items-center justify-between border-t px-6 py-4">
			<span className="text-muted-foreground text-sm">
				Page {currentPage} of {lastPage}
			</span>
			<div className="flex gap-2">
				<Button
					disabled={currentPage <= 1}
					onClick={() => onPageChange(currentPage - 1)}
					size="sm"
					variant="outline"
				>
					Previous
				</Button>
				<Button
					disabled={currentPage >= lastPage}
					onClick={() => onPageChange(currentPage + 1)}
					size="sm"
					variant="outline"
				>
					Next
				</Button>
			</div>
		</div>
	);
}
