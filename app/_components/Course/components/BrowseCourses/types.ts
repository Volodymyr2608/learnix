import type { GetPublishedCoursesResponse } from "@/lib/requests/course/getPublishedCourses";

export type BrowseCoursesProps = {
	initialCourses: GetPublishedCoursesResponse;
};
