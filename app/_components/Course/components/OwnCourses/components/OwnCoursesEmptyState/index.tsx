import { BookOpen } from "lucide-react";

export function OwnCoursesEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center gap-2 py-12">
			<BookOpen className="h-12 w-12 text-muted-foreground" />
			<p className="font-medium text-lg">No courses found</p>
			<p className="text-muted-foreground text-sm">
				Try adjusting your search or filters
			</p>
		</div>
	);
}
