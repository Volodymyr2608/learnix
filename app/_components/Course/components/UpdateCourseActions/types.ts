import type { CourseStatus } from "@/generated/prisma";

export type UpdateCourseActionsProps = {
	courseId?: string;
	status: CourseStatus;
	previewVideoUrl: string | null;
	thumbnailUrl: string | null;
};
