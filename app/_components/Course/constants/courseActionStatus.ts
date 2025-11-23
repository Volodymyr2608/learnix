export const COURSE_ACTION_STATUS = {
	IDLE: "idle",
	SAVING: "saving",
	PUBLISHING: "publishing",
} as const;

export type CourseActionStatus =
	(typeof COURSE_ACTION_STATUS)[keyof typeof COURSE_ACTION_STATUS];
