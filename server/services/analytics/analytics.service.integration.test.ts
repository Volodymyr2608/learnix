import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
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
