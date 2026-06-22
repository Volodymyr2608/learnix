import { api } from "@/trpc/server";

/**
 * Whether the current student is enrolled in the given course, plus a resume
 * deep-link target. Drives the "Continue Learning" vs buy/enroll CTA on the
 * course detail page. Falls back to "not enrolled" on any error.
 */
const getEnrollmentStatus = async (courseId: string) => {
	try {
		return await api.course.getEnrollmentStatus(courseId);
	} catch (error) {
		console.error(error);
		return { isEnrolled: false, nextLessonId: null };
	}
};

export default getEnrollmentStatus;
