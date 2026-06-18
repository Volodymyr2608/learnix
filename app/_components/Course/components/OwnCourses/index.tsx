import CourseCard from "@/app/_components/Course/components/CourseCard";
import { CoursePagination } from "@/app/_components/Course/components/CoursePagination";
import { searchOwnCourses } from "@/app/_components/Course/components/OwnCourses/actions/searchOwnCourses";
import { OwnCoursesFilters } from "@/app/_components/Course/components/OwnCourses/components/OwnCoursesFilters";
import { buildOwnCoursesHref } from "@/app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref";
import { toSearchInput } from "@/app/_components/Course/components/OwnCourses/searchParams";
import type { OwnCoursesProps } from "@/app/_components/Course/components/OwnCourses/types";

const OwnCourses = async ({ query }: OwnCoursesProps) => {
	const { data, lastPage } = await searchOwnCourses(toSearchInput(query));
	const currentPage = Math.min(query.page, lastPage);

	return (
		<div className="space-y-6">
			<OwnCoursesFilters query={query} />

			{data.length > 0 && (
				<div className="grid gap-6 md:grid-cols-3">
					{data.map((course) => (
						<CourseCard course={course} key={course.id} />
					))}
				</div>
			)}

			{data.length === 0 && (
				<p className="py-12 text-center text-muted-foreground">
					No courses found.
				</p>
			)}

			{lastPage > 1 && (
				<CoursePagination
					buildHref={(p) => buildOwnCoursesHref({ ...query, page: p })}
					currentPage={currentPage}
					totalPages={lastPage}
				/>
			)}
		</div>
	);
};

export default OwnCourses;
