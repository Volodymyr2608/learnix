import { api } from "@/trpc/server";

export type GetOwnCourseDetailResponse = Awaited<
	ReturnType<typeof getOwnCourseDetail>
>;

/**
 * Owning-instructor-scoped course detail for the "view as student" page.
 * Returns the same shape as {@link getPublishedCourse} but works for the
 * instructor's own drafts too.
 */
export const getOwnCourseDetail = (courseId: string) => {
	try {
		return api.course.getOwnCourseDetail(courseId);
	} catch (error) {
		console.error(error);
		return null;
	}
};
