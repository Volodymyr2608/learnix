import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { analyticsService } from "./analytics.service";

describe("AnalyticsService.getOverviewSummary", () => {
	it("aggregates across the instructor's courses with deltas", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const now = new Date();
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: s1.id,
			courseId: course.id,
			progress: 100,
			enrolledAt: now,
			lastAccessedAt: now,
		});
		await makeEnrollment({
			studentId: s2.id,
			courseId: course.id,
			progress: 50,
			enrolledAt: now,
		});

		const summary = await analyticsService.getOverviewSummary(instructor.id);
		expect(summary.enrollments.value).toBe(2);
		expect(summary.avgProgress.value).toBe(75);
		expect(summary.avgProgress.delta).toEqual({ kind: "none" });
		expect(summary.activeLearners.value).toBe(1);
	});

	it("returns an empty-but-valid summary for an instructor with no courses", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const summary = await analyticsService.getOverviewSummary(instructor.id);
		expect(summary.enrollments.value).toBe(0);
		expect(summary.quizPassRate.attempts).toBe(0);
		expect(summary.avgProgress.value).toBe(0);
	});
});

describe("AnalyticsService per-course", () => {
	it("rejects a course the instructor does not own", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const foreign = await makeCourse({ instructorId: other.id });
		await expect(
			analyticsService.getCourseSummary(instructor.id, foreign.id),
		).rejects.toThrow();
	});

	it("builds an ordered lesson funnel for an owned course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const section = await makeSection({ courseId: course.id, order: 0 });
		const l1 = await makeLesson({
			sectionId: section.id,
			order: 0,
			title: "Intro",
		});
		const l2 = await makeLesson({
			sectionId: section.id,
			order: 1,
			title: "Deep dive",
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: course.id });
		const { testDb } = await import("@/test/db");
		await testDb.lessonProgress.create({
			data: { lessonId: l1.id, studentId: s1.id, isCompleted: true },
		});

		const funnel = await analyticsService.getLessonFunnel(
			instructor.id,
			course.id,
		);
		expect(funnel.map((f) => f.title)).toEqual(["Intro", "Deep dive"]);
		expect(funnel.map((f) => f.order)).toEqual([0, 1]);
		expect(funnel[0]).toMatchObject({
			lessonId: l1.id,
			enrolled: 1,
			completed: 1,
		});
		expect(funnel[1]).toMatchObject({
			lessonId: l2.id,
			enrolled: 1,
			completed: 0,
		});
	});
});
