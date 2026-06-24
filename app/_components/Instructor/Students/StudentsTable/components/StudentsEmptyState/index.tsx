import { Users } from "lucide-react";

export function StudentsEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-12">
			<Users className="h-12 w-12 text-muted-foreground" />
			<p className="mt-4 font-medium text-lg">No students found</p>
			<p className="text-muted-foreground text-sm">
				Try adjusting your search or filter criteria
			</p>
		</div>
	);
}
