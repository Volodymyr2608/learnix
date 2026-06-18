import { CoursePagination } from "@/app/_components/Course/components/CoursePagination";
import { searchOwnCourses } from "@/app/_components/Course/components/OwnCourses/actions/searchOwnCourses";
import { OwnCoursesEmptyState } from "@/app/_components/Course/components/OwnCourses/components/OwnCoursesEmptyState";
import { OwnCoursesFilters } from "@/app/_components/Course/components/OwnCourses/components/OwnCoursesFilters";
import { OwnCoursesList } from "@/app/_components/Course/components/OwnCourses/components/OwnCoursesList";
import { buildOwnCoursesQueryParams } from "@/app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref";
import { toSearchInput } from "@/app/_components/Course/components/OwnCourses/searchParams";
import type { OwnCoursesProps } from "@/app/_components/Course/components/OwnCourses/types";

const OwnCourses = async ({ query }: OwnCoursesProps) => {
	const { data, lastPage } = await searchOwnCourses(toSearchInput(query));
	const currentPage = Math.min(query.page, lastPage);

	return (
		<div className="space-y-6">
			<OwnCoursesFilters query={query} />

			{data.length > 0 && <OwnCoursesList courses={data} />}

			{data.length === 0 && <OwnCoursesEmptyState />}

			{lastPage > 1 && (
				<CoursePagination
					basePath="/instructor/courses"
					currentPage={currentPage}
					query={buildOwnCoursesQueryParams(query)}
					totalPages={lastPage}
				/>
			)}
		</div>
	);
};

export default OwnCourses;
