import { Badge } from "@/app/_components/_shared/ui/badge";
import { VISIBLE_COURSES } from "../../constants/courseDisplay";
import { truncateTitle } from "../../helpers/truncateTitle";
import type { EnrolledCoursesCellProps } from "./types";

export function EnrolledCoursesCell({ courses }: EnrolledCoursesCellProps) {
	const hidden = courses.length - VISIBLE_COURSES;
	return (
		<div className="flex flex-wrap gap-1">
			{courses.slice(0, VISIBLE_COURSES).map((course) => (
				<Badge className="text-xs" key={course.courseId} variant="secondary">
					{truncateTitle(course.title)}
				</Badge>
			))}
			{hidden > 0 && (
				<Badge className="text-xs" variant="outline">
					+{hidden} more
				</Badge>
			)}
		</div>
	);
}
