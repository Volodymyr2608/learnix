import { describe, expect, it } from "vitest";
import type { AchievementMetrics } from "@/server/entities/student/achievements";
import {
	evaluateAchievements,
	selectVisibleAchievements,
} from "./achievements.rules";

const ZERO: AchievementMetrics = {
	coursesCompleted: 0,
	enrolledCourses: 0,
	currentStreakDays: 0,
	totalStudyDays: 0,
	lifetimeMinutes: 0,
	lessonsCompleted: 0,
	correctQuizAnswers: 0,
	reviewsWritten: 0,
};

describe("evaluateAchievements", () => {
	it("marks every achievement unearned at 0/target for a brand-new student", () => {
		const result = evaluateAchievements(ZERO);
		expect(result.length).toBeGreaterThan(0);
		for (const a of result) {
			expect(a.earned).toBe(false);
			expect(a.current).toBe(0);
		}
	});

	it("earns an achievement when its metric exactly meets the target", () => {
		const result = evaluateAchievements({ ...ZERO, coursesCompleted: 1 });
		expect(result.find((a) => a.key === "first-course")).toMatchObject({
			earned: true,
			current: 1,
			target: 1,
		});
	});

	it("caps current at target when the metric exceeds it", () => {
		const result = evaluateAchievements({ ...ZERO, coursesCompleted: 999 });
		expect(result.find((a) => a.key === "first-course")).toMatchObject({
			earned: true,
			current: 1,
			target: 1,
		});
	});

	it("leaves an achievement unearned just below its target", () => {
		const result = evaluateAchievements({ ...ZERO, currentStreakDays: 6 });
		expect(result.find((a) => a.key === "consistent")).toMatchObject({
			earned: false,
			current: 6,
			target: 7,
		});
	});

	it("evaluates independent metrics against their own rules without cross-contamination", () => {
		const result = evaluateAchievements({
			...ZERO,
			lessonsCompleted: 100,
			correctQuizAnswers: 50,
			reviewsWritten: 5,
		});
		expect(result.find((a) => a.key === "lesson-crusher")).toMatchObject({
			earned: true,
		});
		expect(result.find((a) => a.key === "quiz-master")).toMatchObject({
			earned: true,
		});
		expect(result.find((a) => a.key === "critic")).toMatchObject({
			earned: true,
		});
		expect(result.find((a) => a.key === "first-course")).toMatchObject({
			earned: false,
		});
	});
});

describe("selectVisibleAchievements", () => {
	it("shows exactly the first tier of every group for a brand-new student", () => {
		const visible = selectVisibleAchievements(evaluateAchievements(ZERO));
		const groups = new Set(visible.map((a) => a.group));
		expect(groups.size).toBe(8);
		expect(visible.find((a) => a.key === "first-course")).toBeDefined();
		expect(visible.find((a) => a.key === "course-master")).toBeUndefined();
	});

	it("shows earned tiers plus the single next goal, hiding further locked tiers", () => {
		const visible = selectVisibleAchievements(
			evaluateAchievements({ ...ZERO, coursesCompleted: 4 }),
		);
		const courseTiers = visible.filter((a) => a.group === "courses");
		expect(courseTiers.map((a) => a.key)).toEqual([
			"first-course",
			"course-master",
		]);
		expect(courseTiers.find((a) => a.key === "first-course")).toMatchObject({
			earned: true,
		});
		expect(courseTiers.find((a) => a.key === "course-master")).toMatchObject({
			earned: false,
			current: 4,
			target: 5,
		});
	});

	it("shows every tier of a fully-earned group with no extra locked tier", () => {
		const visible = selectVisibleAchievements(
			evaluateAchievements({ ...ZERO, coursesCompleted: 999 }),
		);
		const courseTiers = visible.filter((a) => a.group === "courses");
		expect(courseTiers.map((a) => a.key)).toEqual([
			"first-course",
			"course-master",
			"scholar",
			"graduate",
		]);
		expect(courseTiers.every((a) => a.earned)).toBe(true);
	});
});
