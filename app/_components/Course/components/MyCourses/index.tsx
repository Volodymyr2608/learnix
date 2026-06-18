import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { CoursePagination } from "@/app/_components/Course/components/CoursePagination";
import { CourseTabFilter } from "@/app/_components/Course/components/MyCourses/components/CourseTabFilter";
import { EnrolledCourseCard } from "@/app/_components/Course/components/MyCourses/components/EnrolledCourseCard";
import type { MyCoursesProps } from "@/app/_components/Course/components/MyCourses/types";
import { COURSE_PAGE_SIZE } from "@/lib/constants/pagination";

export const MyCourses = ({
	courses,
	total,
	currentTab,
	currentPage,
}: MyCoursesProps) => {
	const totalPages = Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE));
	const safePage = Math.min(currentPage, totalPages);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl tracking-tight">My Courses</h1>
					<p className="text-muted-foreground">
						Manage and continue your learning journey
					</p>
				</div>
				<Button asChild>
					<Link href="/dashboard/browse">Browse More Courses</Link>
				</Button>
			</div>

			<CourseTabFilter currentTab={currentTab} />

			{courses.length === 0 ? (
				<p className="text-muted-foreground text-sm">No courses found.</p>
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{courses.map((course) => (
						<EnrolledCourseCard course={course} key={course.id} />
					))}
				</div>
			)}

			{totalPages > 1 && (
				<CoursePagination
					basePath="/dashboard/courses"
					currentPage={safePage}
					query={{ tab: currentTab }}
					totalPages={totalPages}
				/>
			)}
		</div>
	);
};
