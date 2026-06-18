import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";

export type OwnCoursesQueryState = {
	q: string;
	status: GetOwnCoursesInput["status"];
	category: string;
	sort: GetOwnCoursesInput["sort"];
	page: number;
};

export type OwnCoursesProps = {
	query: OwnCoursesQueryState;
};
