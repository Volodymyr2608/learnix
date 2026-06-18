import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLessonProgressRepo = {
	getCompletedMinutesTotals: vi.fn(),
	getDailyCompletedMinutes: vi.fn(),
	getCompletionDays: vi.fn(),
	getStudentLessonStats: vi.fn(),
	findCompletedByLessonIds: vi.fn(),
};
const mockEnrollmentRepo = {
	getStudentCompletionStats: vi.fn(),
	getStudentEnrollmentStats: vi.fn(),
	findInProgressForContinue: vi.fn(),
};
const mockLessonRepo = {
	findOrderedLessonIdsByCourseIds: vi.fn(),
};

vi.mock("@/server/repositories/lessonProgress.repository", () => ({
	lessonProgressRepository: mockLessonProgressRepo,
}));
vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));
vi.mock("@/server/repositories/lesson.repository", () => ({
	lessonRepository: mockLessonRepo,
}));

const { studentService } = await import("./student.service");
const STUDENT_ID = "student-1";

describe("StudentService.getProgressStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 5, 17, 12, 0, 0)); // Wed Jun 17 2026
	});

	it("assembles totals, deltas, a 7-day zero-filled chart, avg, and streak", async () => {
		mockLessonProgressRepo.getCompletedMinutesTotals.mockResolvedValue({
			lifetimeMinutes: 9390, // 156.5h
			thisWeekMinutes: 200,
			priorWeekMinutes: 100,
		});
		mockLessonProgressRepo.getDailyCompletedMinutes.mockResolvedValue([
			{ day: new Date(2026, 5, 16), minutes: 120 }, // Tue
			{ day: new Date(2026, 5, 17), minutes: 80 }, // Wed (today)
		]);
		mockLessonProgressRepo.getCompletionDays.mockResolvedValue([
			new Date(2026, 5, 17),
			new Date(2026, 5, 16),
			new Date(2026, 5, 15),
			new Date(2026, 5, 12), // gap → streak stops at 3
		]);
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 8,
			thisMonthNew: 2,
			lastMonthNew: 0,
		});

		const r = await studentService.getProgressStats(STUDENT_ID);

		expect(r.totalMinutes).toBe(9390);
		expect(r.totalHoursDelta).toEqual({
			kind: "percent",
			value: 100,
			direction: "up",
		});
		expect(r.coursesCompleted).toEqual({ total: 8, delta: { kind: "new" } });
		expect(r.weeklyActivity).toHaveLength(7);
		expect(r.weeklyActivity[6]).toEqual({
			date: "2026-06-17",
			weekday: "Wed",
			minutes: 80,
		});
		expect(r.weeklyActivity[0]?.minutes).toBe(0); // Jun 11, no data
		expect(r.avgDailyMinutes).toBe(Math.round(200 / 7));
		expect(r.currentStreakDays).toBe(3);
	});

	it("returns zeroed values and a flat chart for a new student", async () => {
		mockLessonProgressRepo.getCompletedMinutesTotals.mockResolvedValue({
			lifetimeMinutes: 0,
			thisWeekMinutes: 0,
			priorWeekMinutes: 0,
		});
		mockLessonProgressRepo.getDailyCompletedMinutes.mockResolvedValue([]);
		mockLessonProgressRepo.getCompletionDays.mockResolvedValue([]);
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});

		const r = await studentService.getProgressStats(STUDENT_ID);
		expect(r.totalMinutes).toBe(0);
		expect(r.totalHoursDelta).toEqual({ kind: "none" });
		expect(r.currentStreakDays).toBe(0);
		expect(r.avgDailyMinutes).toBe(0);
		expect(r.weeklyActivity.every((d) => d.minutes === 0)).toBe(true);
	});
});

describe("StudentService.getDashboardStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("assembles the four cards with month-over-month deltas and completion rate", async () => {
		mockEnrollmentRepo.getStudentEnrollmentStats.mockResolvedValue({
			active: 5,
			total: 8,
			thisMonthNew: 2,
			lastMonthNew: 1,
		});
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 4,
			thisMonthNew: 1,
			lastMonthNew: 0,
		});
		mockLessonProgressRepo.getStudentLessonStats.mockResolvedValue({
			lifetimeMinutes: 600,
			thisMonthMinutes: 200,
			lastMonthMinutes: 100,
		});

		const r = await studentService.getDashboardStats(STUDENT_ID);

		expect(r.enrolledCourses).toEqual({
			total: 5,
			delta: { kind: "percent", value: 100, direction: "up" },
		});
		expect(r.hoursLearned).toEqual({
			totalMinutes: 600,
			delta: { kind: "percent", value: 100, direction: "up" },
		});
		expect(r.certificates).toEqual({ total: 4, delta: { kind: "new" } });
		expect(r.completionRate).toEqual({ percent: 50 }); // 4 / 8
	});

	it("returns zeroed values and a 0% rate for a new student", async () => {
		mockEnrollmentRepo.getStudentEnrollmentStats.mockResolvedValue({
			active: 0,
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockLessonProgressRepo.getStudentLessonStats.mockResolvedValue({
			lifetimeMinutes: 0,
			thisMonthMinutes: 0,
			lastMonthMinutes: 0,
		});

		const r = await studentService.getDashboardStats(STUDENT_ID);
		expect(r.enrolledCourses.delta).toEqual({ kind: "none" });
		expect(r.hoursLearned).toEqual({
			totalMinutes: 0,
			delta: { kind: "none" },
		});
		expect(r.certificates).toEqual({ total: 0, delta: { kind: "none" } });
		expect(r.completionRate).toEqual({ percent: 0 });
	});
});
