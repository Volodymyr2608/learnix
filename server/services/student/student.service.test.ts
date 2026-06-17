import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLessonProgressRepo = {
	getCompletedMinutesTotals: vi.fn(),
	getDailyCompletedMinutes: vi.fn(),
	getCompletionDays: vi.fn(),
};
const mockEnrollmentRepo = {
	getStudentCompletionStats: vi.fn(),
};

vi.mock("@/server/repositories/lessonProgress.repository", () => ({
	lessonProgressRepository: mockLessonProgressRepo,
}));
vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
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
