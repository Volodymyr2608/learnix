import CourseCard from "@/app/_components/Course/components/CourseCard";
import type { OwnCoursesListProps } from "@/app/_components/Course/components/OwnCourses/components/OwnCoursesList/types";

export function OwnCoursesList({ courses }: OwnCoursesListProps) {
	return (
		<div className="grid gap-6 md:grid-cols-3">
			{courses.map((course) => (
				<CourseCard course={course} key={course.id} />
			))}
		</div>
	);
}
