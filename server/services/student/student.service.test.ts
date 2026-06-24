import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLessonProgressRepo = {
	getCompletedMinutesTotals: vi.fn(),
	getDailyCompletedMinutes: vi.fn(),
	getCompletionDays: vi.fn(),
	getStudentLessonStats: vi.fn(),
	findCompletedByLessonIds: vi.fn(),
	countCompletedTotal: vi.fn(),
};
const mockEnrollmentRepo = {
	getStudentCompletionStats: vi.fn(),
	getStudentEnrollmentStats: vi.fn(),
	findInProgressForContinue: vi.fn(),
};
const mockLessonRepo = {
	findOrderedLessonIdsByCourseIds: vi.fn(),
};
const mockQuizAttemptRepo = {
	countCorrect: vi.fn(),
};
const mockCourseReviewRepo = {
	count: vi.fn(),
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
vi.mock("@/server/repositories/quizAttempt.repository", () => ({
	quizAttemptRepository: mockQuizAttemptRepo,
}));
vi.mock("@/server/repositories/courseReview.repository", () => ({
	courseReviewRepository: mockCourseReviewRepo,
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

describe("StudentService.getAchievements", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds metrics from repositories and returns evaluated achievement views", async () => {
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 1,
			thisMonthNew: 1,
			lastMonthNew: 0,
		});
		mockEnrollmentRepo.getStudentEnrollmentStats.mockResolvedValue({
			active: 3,
			total: 3,
			thisMonthNew: 1,
			lastMonthNew: 0,
		});
		mockLessonProgressRepo.getCompletionDays.mockResolvedValue([
			new Date(2026, 5, 17),
			new Date(2026, 5, 16),
		]);
		mockLessonProgressRepo.getCompletedMinutesTotals.mockResolvedValue({
			lifetimeMinutes: 600,
			thisWeekMinutes: 0,
			priorWeekMinutes: 0,
		});
		mockLessonProgressRepo.countCompletedTotal.mockResolvedValue(10);
		mockQuizAttemptRepo.countCorrect.mockResolvedValue(10);
		mockCourseReviewRepo.count.mockResolvedValue(1);

		const r = await studentService.getAchievements(STUDENT_ID);

		expect(mockCourseReviewRepo.count).toHaveBeenCalledWith({
			studentId: STUDENT_ID,
			deletedAt: null,
		});
		expect(r.find((a) => a.key === "first-course")).toMatchObject({
			earned: true,
			current: 1,
			target: 1,
		});
		expect(r.find((a) => a.key === "consistent")).toMatchObject({
			earned: false,
			current: 2,
			target: 7,
		});
		expect(r.find((a) => a.key === "ten-hours")).toMatchObject({
			earned: true,
			current: 600,
			target: 600,
		});
		expect(r.find((a) => a.key === "first-steps")).toMatchObject({
			earned: true,
		});
		expect(r.find((a) => a.key === "quiz-whiz")).toMatchObject({
			earned: true,
		});
		expect(r.find((a) => a.key === "reviewer")).toMatchObject({
			earned: true,
		});
		// progressive disclosure: earned tiers + the single next goal per group,
		// further locked tiers in the same group stay hidden
		expect(r.find((a) => a.key === "scholar")).toBeUndefined();
		expect(r.find((a) => a.key === "graduate")).toBeUndefined();
		expect(r.find((a) => a.key === "dedicated")).toBeUndefined();
		expect(r.find((a) => a.key === "course-master")).toMatchObject({
			earned: false,
		});
	});

	it("returns exactly one badge per category for a brand-new student", async () => {
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockEnrollmentRepo.getStudentEnrollmentStats.mockResolvedValue({
			active: 0,
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockLessonProgressRepo.getCompletionDays.mockResolvedValue([]);
		mockLessonProgressRepo.getCompletedMinutesTotals.mockResolvedValue({
			lifetimeMinutes: 0,
			thisWeekMinutes: 0,
			priorWeekMinutes: 0,
		});
		mockLessonProgressRepo.countCompletedTotal.mockResolvedValue(0);
		mockQuizAttemptRepo.countCorrect.mockResolvedValue(0);
		mockCourseReviewRepo.count.mockResolvedValue(0);

		const r = await studentService.getAchievements(STUDENT_ID);
		expect(r).toHaveLength(8);
		expect(r.every((a) => !a.earned && a.current === 0)).toBe(true);
	});
});

describe("StudentService.getContinueLearning", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("resolves the first incomplete lesson per in-progress course, preserving order", async () => {
		mockEnrollmentRepo.findInProgressForContinue.mockResolvedValue([
			{ courseId: "c1", courseTitle: "Course One", progress: 50 },
			{ courseId: "c2", courseTitle: "Course Two", progress: 80 },
		]);
		mockLessonRepo.findOrderedLessonIdsByCourseIds.mockResolvedValue([
			{ courseId: "c1", lessonId: "c1l1", title: "C1 L1" },
			{ courseId: "c1", lessonId: "c1l2", title: "C1 L2" },
			{ courseId: "c2", lessonId: "c2l1", title: "C2 L1" },
		]);
		// c1l1 is done → next for c1 is c1l2; nothing done for c2 → next is c2l1
		mockLessonProgressRepo.findCompletedByLessonIds.mockResolvedValue([
			{ lessonId: "c1l1" },
		]);

		const items = await studentService.getContinueLearning(STUDENT_ID);

		expect(items).toEqual([
			{
				courseId: "c1",
				courseTitle: "Course One",
				progress: 50,
				nextLessonId: "c1l2",
				nextLessonTitle: "C1 L2",
			},
			{
				courseId: "c2",
				courseTitle: "Course Two",
				progress: 80,
				nextLessonId: "c2l1",
				nextLessonTitle: "C2 L1",
			},
		]);
	});

	it("drops a course whose every lesson is completed, and returns [] when none in progress", async () => {
		mockEnrollmentRepo.findInProgressForContinue.mockResolvedValueOnce([
			{ courseId: "c1", courseTitle: "Course One", progress: 99 },
		]);
		mockLessonRepo.findOrderedLessonIdsByCourseIds.mockResolvedValueOnce([
			{ courseId: "c1", lessonId: "c1l1", title: "C1 L1" },
		]);
		mockLessonProgressRepo.findCompletedByLessonIds.mockResolvedValueOnce([
			{ lessonId: "c1l1" },
		]);
		expect(await studentService.getContinueLearning(STUDENT_ID)).toEqual([]);

		mockEnrollmentRepo.findInProgressForContinue.mockResolvedValueOnce([]);
		expect(await studentService.getContinueLearning(STUDENT_ID)).toEqual([]);
	});
});
