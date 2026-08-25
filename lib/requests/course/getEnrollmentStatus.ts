import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import { api } from "@/trpc/server";

/**
 * Whether the current student is enrolled in the given course, plus a resume
 * deep-link target. Drives the "Continue Learning" vs buy/enroll CTA on the
 * course detail page. Falls back to "not enrolled" on any error.
 */
const getEnrollmentStatus = async (courseId: string) => {
	return safeRequest(
		"course.getEnrollmentStatus",
		async () => {
			return await api.course.getEnrollmentStatus(courseId);
		},
		{ isEnrolled: false, nextLessonId: null },
	);
};

export default getEnrollmentStatus;
