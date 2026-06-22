import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnrollmentRepo = {
	findByIdWithRelations: vi.fn(),
	findByStudentCourseWithRelations: vi.fn(),
};
const mockNotificationLogRepo = { tryLog: vi.fn() };
const mockEmailService = { send: vi.fn() };

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));
vi.mock("@/server/repositories/lessonProgress.repository", () => ({
	lessonProgressRepository: {},
}));
vi.mock("@/server/repositories/notificationLog.repository", () => ({
	notificationLogRepository: mockNotificationLogRepo,
}));
vi.mock("@/server/services/email/email.service", () => ({
	emailService: mockEmailService,
}));
vi.mock("./auth", () => ({
	signCertificateToken: vi.fn().mockResolvedValue("cert-tok"),
}));
vi.mock("@/server/services/email/unsubscribe-token", () => ({
	signUnsubscribeToken: vi.fn().mockResolvedValue("unsub-tok"),
}));

const { notificationService } = await import("./notification.service");

const ENR = {
	id: "enr-1",
	studentId: "student-1",
	courseId: "course-1",
	completedAt: new Date("2026-06-20T10:00:00Z"),
	student: {
		id: "student-1",
		email: "stu@example.com",
		name: "Stu",
		emailNotificationsEnabled: true,
	},
	course: { id: "course-1", title: "TS Pro", instructor: { name: "Ada" } },
};

describe("NotificationService.fireCertificateEarned", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnrollmentRepo.findByIdWithRelations.mockResolvedValue(ENR);
	});

	it("dedups then sends the course.certificate email", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: true });

		await notificationService.fireCertificateEarned("enr-1");

		expect(mockNotificationLogRepo.tryLog).toHaveBeenCalledWith(
			expect.objectContaining({
				dedupKey: "student-1:certificate:course-1",
				userId: "student-1",
				automation: "certificate_earned",
			}),
		);
		expect(mockEmailService.send).toHaveBeenCalledTimes(1);
		const arg = mockEmailService.send.mock.calls[0]?.[0];
		expect(arg.templateKey).toBe("course.certificate");
		expect(arg.toEmail).toBe("stu@example.com");
		expect(arg.userId).toBe("student-1");
		expect(arg.payload).toMatchObject({
			studentName: "Stu",
			courseTitle: "TS Pro",
			instructorName: "Ada",
		});
		expect(arg.payload.certificatePdfUrl).toContain("token=cert-tok");
	});

	it("does not send when the email was already logged for this enrollment", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: false });

		await notificationService.fireCertificateEarned("enr-1");

		expect(mockEmailService.send).not.toHaveBeenCalled();
	});

	it("returns silently when the enrollment is missing", async () => {
		mockEnrollmentRepo.findByIdWithRelations.mockResolvedValue(null);

		await notificationService.fireCertificateEarned("missing");

		expect(mockNotificationLogRepo.tryLog).not.toHaveBeenCalled();
		expect(mockEmailService.send).not.toHaveBeenCalled();
	});
});

describe("NotificationService.fireProgressNearCompletion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnrollmentRepo.findByStudentCourseWithRelations.mockResolvedValue({
			id: "enr-1",
			studentId: "student-1",
			courseId: "course-1",
			student: {
				email: "stu@example.com",
				name: "Stu",
				emailNotificationsEnabled: true,
			},
			course: { id: "course-1", title: "TS Pro" },
		});
	});

	const PROGRESS = {
		completedLessons: 8,
		totalLessons: 10,
		lessonsRemaining: 2,
		nextLessonId: "lesson-9",
		nextLessonTitle: "Generics",
	};

	it("dedups then sends the engagement.near-completion email", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: true });

		await notificationService.fireProgressNearCompletion(
			"student-1",
			"course-1",
			PROGRESS,
		);

		expect(mockNotificationLogRepo.tryLog).toHaveBeenCalledWith(
			expect.objectContaining({
				dedupKey: "student-1:near_completion:course-1",
				userId: "student-1",
				automation: "near_completion",
			}),
		);
		const arg = mockEmailService.send.mock.calls[0]?.[0];
		expect(arg.templateKey).toBe("engagement.near-completion");
		expect(arg.toEmail).toBe("stu@example.com");
		expect(arg.payload).toMatchObject({
			studentName: "Stu",
			courseTitle: "TS Pro",
			lessonsRemaining: 2,
		});
		expect(arg.payload.nextLessonUrl).toContain("lesson-9");
	});

	it("does not send twice for the same enrollment", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: false });

		await notificationService.fireProgressNearCompletion(
			"student-1",
			"course-1",
			PROGRESS,
		);

		expect(mockEmailService.send).not.toHaveBeenCalled();
	});
});
