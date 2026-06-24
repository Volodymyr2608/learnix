export type AchievementIconKey =
	| "graduation"
	| "compass"
	| "flame"
	| "calendar"
	| "clock"
	| "book"
	| "brain"
	| "star";

export type AchievementGroup =
	| "courses"
	| "enrolled"
	| "streak"
	| "studyDays"
	| "minutes"
	| "lessons"
	| "quiz"
	| "reviews";

/** Raw activity numbers achievements are evaluated against. */
export type AchievementMetrics = {
	coursesCompleted: number;
	enrolledCourses: number;
	currentStreakDays: number;
	totalStudyDays: number;
	lifetimeMinutes: number;
	lessonsCompleted: number;
	correctQuizAnswers: number;
	reviewsWritten: number;
};

/** One achievement badge as rendered on the progress page. */
export type AchievementView = {
	key: string;
	title: string;
	description: string;
	icon: AchievementIconKey;
	group: AchievementGroup;
	target: number;
	current: number; // capped at target
	earned: boolean;
};
