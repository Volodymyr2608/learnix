import Link from "next/link";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { Button } from "@/app/_components/_shared/ui/button";
import { CoursePagination } from "@/app/_components/Course/components/CoursePagination";
import { CourseTabFilter } from "@/app/_components/Course/components/MyCourses/components/CourseTabFilter";
import { EnrolledCourseCard } from "@/app/_components/Course/components/MyCourses/components/EnrolledCourseCard";
import { MyCoursesEmptyState } from "@/app/_components/Course/components/MyCourses/components/MyCoursesEmptyState";
import type { MyCoursesProps } from "@/app/_components/Course/components/MyCourses/types";
import { COURSE_PAGE_SIZE } from "@/lib/constants/pagination";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";

export const MyCourses = ({
	courses,
	total,
	currentTab,
	currentPage,
}: MyCoursesProps) => {
	const totalPages = Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE));
	const safePage = Math.min(currentPage, totalPages);

	return (
		<PageShell
			action={
				<Button asChild>
					<Link href={STUDENT_URLS.browseCourse}>Browse More Courses</Link>
				</Button>
			}
			description="Manage and continue your learning journey"
			title="My Courses"
		>
			<CourseTabFilter currentTab={currentTab} />

			{courses.length === 0 ? (
				<MyCoursesEmptyState currentTab={currentTab} />
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{courses.map((course) => (
						<EnrolledCourseCard course={course} key={course.id} />
					))}
				</div>
			)}

			{totalPages > 1 && (
				<CoursePagination
					basePath={STUDENT_URLS.courses}
					currentPage={safePage}
					query={{ tab: currentTab }}
					totalPages={totalPages}
				/>
			)}
		</PageShell>
	);
};
