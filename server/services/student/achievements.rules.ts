import type {
	AchievementGroup,
	AchievementIconKey,
	AchievementMetrics,
	AchievementView,
} from "@/server/entities/student/achievements";

type AchievementRule = {
	key: string;
	title: string;
	description: string;
	icon: AchievementIconKey;
	group: AchievementGroup;
	target: number;
	metric: (m: AchievementMetrics) => number;
};

export const ACHIEVEMENT_RULES: AchievementRule[] = [
	{
		key: "first-course",
		title: "First Course",
		description: "Complete your first course",
		icon: "graduation",
		group: "courses",
		target: 1,
		metric: (m) => m.coursesCompleted,
	},
	{
		key: "course-master",
		title: "Course Master",
		description: "Complete 5 courses",
		icon: "graduation",
		group: "courses",
		target: 5,
		metric: (m) => m.coursesCompleted,
	},
	{
		key: "scholar",
		title: "Scholar",
		description: "Complete 10 courses",
		icon: "graduation",
		group: "courses",
		target: 10,
		metric: (m) => m.coursesCompleted,
	},
	{
		key: "graduate",
		title: "Graduate",
		description: "Complete 25 courses",
		icon: "graduation",
		group: "courses",
		target: 25,
		metric: (m) => m.coursesCompleted,
	},
	{
		key: "curious",
		title: "Curious",
		description: "Enroll in 3 courses",
		icon: "compass",
		group: "enrolled",
		target: 3,
		metric: (m) => m.enrolledCourses,
	},
	{
		key: "knowledge-seeker",
		title: "Knowledge Seeker",
		description: "Enroll in 10 courses",
		icon: "compass",
		group: "enrolled",
		target: 10,
		metric: (m) => m.enrolledCourses,
	},
	{
		key: "consistent",
		title: "Consistent Student",
		description: "Study 7 days in a row",
		icon: "flame",
		group: "streak",
		target: 7,
		metric: (m) => m.currentStreakDays,
	},
	{
		key: "dedicated",
		title: "Dedicated",
		description: "Study 30 days in a row",
		icon: "flame",
		group: "streak",
		target: 30,
		metric: (m) => m.currentStreakDays,
	},
	{
		key: "unstoppable",
		title: "Unstoppable",
		description: "Study 100 days in a row",
		icon: "flame",
		group: "streak",
		target: 100,
		metric: (m) => m.currentStreakDays,
	},
	{
		key: "habit-former",
		title: "Habit Former",
		description: "Study on 30 different days",
		icon: "calendar",
		group: "studyDays",
		target: 30,
		metric: (m) => m.totalStudyDays,
	},
	{
		key: "ten-hours",
		title: "Getting Started",
		description: "Reach 10 hours of learning",
		icon: "clock",
		group: "minutes",
		target: 600,
		metric: (m) => m.lifetimeMinutes,
	},
	{
		key: "fifty-hours",
		title: "Marathon Learner",
		description: "Reach 50 hours of learning",
		icon: "clock",
		group: "minutes",
		target: 3000,
		metric: (m) => m.lifetimeMinutes,
	},
	{
		key: "centurion",
		title: "Centurion",
		description: "Reach 100 hours of learning",
		icon: "clock",
		group: "minutes",
		target: 6000,
		metric: (m) => m.lifetimeMinutes,
	},
	{
		key: "first-steps",
		title: "First Steps",
		description: "Complete 10 lessons",
		icon: "book",
		group: "lessons",
		target: 10,
		metric: (m) => m.lessonsCompleted,
	},
	{
		key: "lesson-crusher",
		title: "Lesson Crusher",
		description: "Complete 100 lessons",
		icon: "book",
		group: "lessons",
		target: 100,
		metric: (m) => m.lessonsCompleted,
	},
	{
		key: "quiz-whiz",
		title: "Quiz Whiz",
		description: "Answer 10 quiz questions correctly",
		icon: "brain",
		group: "quiz",
		target: 10,
		metric: (m) => m.correctQuizAnswers,
	},
	{
		key: "quiz-master",
		title: "Quiz Master",
		description: "Answer 50 quiz questions correctly",
		icon: "brain",
		group: "quiz",
		target: 50,
		metric: (m) => m.correctQuizAnswers,
	},
	{
		key: "reviewer",
		title: "Reviewer",
		description: "Write your first course review",
		icon: "star",
		group: "reviews",
		target: 1,
		metric: (m) => m.reviewsWritten,
	},
	{
		key: "critic",
		title: "Critic",
		description: "Write 5 course reviews",
		icon: "star",
		group: "reviews",
		target: 5,
		metric: (m) => m.reviewsWritten,
	},
];

export function evaluateAchievements(
	metrics: AchievementMetrics,
): AchievementView[] {
	return ACHIEVEMENT_RULES.map((rule) => {
		const value = rule.metric(metrics);
		return {
			key: rule.key,
			title: rule.title,
			description: rule.description,
			icon: rule.icon,
			group: rule.group,
			target: rule.target,
			current: Math.min(value, rule.target),
			earned: value >= rule.target,
		};
	});
}

/**
 * Per group, keep every earned tier plus the single next locked tier (the
 * current goal). Further locked tiers in that group stay hidden until reached.
 * Relies on rules within a group being declared in ascending-target order.
 */
export function selectVisibleAchievements(
	views: AchievementView[],
): AchievementView[] {
	const byGroup = new Map<AchievementGroup, AchievementView[]>();
	for (const view of views) {
		const list = byGroup.get(view.group) ?? [];
		list.push(view);
		byGroup.set(view.group, list);
	}

	const visibleKeys = new Set<string>();
	for (const group of byGroup.values()) {
		const firstUnearnedIndex = group.findIndex((v) => !v.earned);
		const cutoff =
			firstUnearnedIndex === -1 ? group.length : firstUnearnedIndex + 1;
		for (const view of group.slice(0, cutoff)) visibleKeys.add(view.key);
	}

	return views.filter((view) => visibleKeys.has(view.key));
}
