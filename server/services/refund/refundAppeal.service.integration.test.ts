import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetWindowsForTest } from "@/server/services/_shared/aiLimits/checkAiRateLimit";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeOpenedLesson,
	makePayment,
	makeRefundRequest,
	makeSection,
	makeUser,
} from "@/test/factories";

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => flag.on,
}));
const send = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send },
}));
const blob = vi.hoisted(() => ({
	put: vi.fn(),
	del: vi.fn(),
	get: vi.fn(),
}));
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/env")>();
	return {
		env: { ...actual.env, REFUND_EVIDENCE_BLOB_TOKEN: "test-private-token" },
	};
});

const { refundAppealService } = await import("./refundAppeal.service");

const DAY = 24 * 60 * 60 * 1000;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const png = (name = "proof.png") =>
	new File([PNG], name, { type: "image/png" });
const svgAsPng = () =>
	new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "x.png", {
		type: "image/png",
	});

describe("refundAppealService.fileAppeal (FR-S13–S16, AC-F6, AC-F8)", () => {
	let student: { id: string };
	let instructorId: string;
	let courseId: string;
	let lessons: { id: string }[];
	let paymentId: string;

	const openLessons = async (n: number) => {
		for (const lesson of lessons.slice(0, n))
			await makeOpenedLesson({ studentId: student.id, lessonId: lesson.id });
	};

	const file = (overrides: Record<string, unknown> = {}) =>
		refundAppealService.fileAppeal(student.id, {
			paymentId,
			reason: "thin_content",
			text: "Half the lessons were empty placeholders.",
			files: [],
			...overrides,
		});

	beforeEach(async () => {
		flag.on = true;
		await truncateAll();
		await __resetWindowsForTest();
		vi.clearAllMocks();
		send.mockResolvedValue({ id: "em_1" });
		blob.put.mockImplementation(async (pathname: string) => ({ pathname }));
		blob.del.mockResolvedValue(undefined);
		await makeUser({ role: "ADMIN", email: "admin@learnix.test" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Rust",
		});
		const section = await makeSection({ courseId: course.id });
		lessons = await Promise.all(
			[0, 1, 2, 3, 4, 5].map((order) =>
				makeLesson({ sectionId: section.id, order }),
			),
		);
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			paidAt: new Date(Date.now() - DAY),
		});
		instructorId = instructor.id;
		courseId = course.id;
		paymentId = payment.id;
	});

	describe("direct appeal (FR-S13)", () => {
		it("stores the request snapshot, the kind and the exceeded condition, without files", async () => {
			await openLessons(4);

			const { appealId } = await file();

			const appeal = await testDb.refundAppeal.findUniqueOrThrow({
				where: { id: appealId },
				include: { request: true, files: true },
			});
			expect(appeal).toMatchObject({
				kind: "direct",
				exceededCondition: "threshold",
				status: "open",
				reason: "thin_content",
			});
			expect(appeal.files).toEqual([]);
			expect(appeal.request).toMatchObject({
				decision: "direct_appeal",
				approval: null,
				refundState: null,
				failedConditions: ["threshold"],
			});
			expect(appeal.request.snapshot).toMatchObject({
				openedCount: 4,
				threshold: 3,
			});
			expect(appeal.deadlineAt.getTime()).toBe(
				((
					await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } })
				).paidAt?.getTime() ?? 0) +
					14 * DAY,
			);
		});

		it("is refused when every condition holds (the student can simply request)", async () => {
			await expect(file()).rejects.toMatchObject({ code: "CONFLICT" });
		});

		it("is refused when another condition fails too", async () => {
			await openLessons(4);
			await testDb.payment.update({
				where: { id: paymentId },
				data: { disputeState: "open" },
			});
			await expect(file()).rejects.toMatchObject({ code: "CONFLICT" });
			expect(await testDb.refundAppeal.count()).toBe(0);
		});
	});

	describe("appeal after an automatic denial (FR-S14)", () => {
		const denied = (createdAt = new Date()) =>
			makeRefundRequest({
				paymentId,
				studentId: student.id,
				courseId,
				decision: "auto_denied",
				refundState: null,
				failedConditions: ["window"],
				createdAt,
			});

		it("records the request's failed condition and the later-of deadline", async () => {
			const request = await denied();

			const { appealId } = await file();

			const appeal = await testDb.refundAppeal.findUniqueOrThrow({
				where: { id: appealId },
			});
			expect(appeal).toMatchObject({
				kind: "after_denial",
				exceededCondition: "window",
				requestId: request.id,
			});
		});

		it("labels a late denial that also failed the threshold by the threshold (audit H-1)", async () => {
			await makeRefundRequest({
				paymentId,
				studentId: student.id,
				courseId,
				decision: "auto_denied",
				refundState: null,
				failedConditions: ["window", "threshold"],
			});

			const { appealId } = await file();

			expect(
				(
					await testDb.refundAppeal.findUniqueOrThrow({
						where: { id: appealId },
					})
				).exceededCondition,
			).toBe("threshold");
		});

		it("is refused after its deadline", async () => {
			await testDb.payment.update({
				where: { id: paymentId },
				data: { paidAt: new Date(Date.now() - 30 * DAY) },
			});
			await denied(new Date(Date.now() - 10 * DAY));

			await expect(file()).rejects.toMatchObject({ code: "CONFLICT" });
		});

		it("is refused a second time (AC-F6)", async () => {
			const request = await denied();
			await makeAppeal({ requestId: request.id });

			await expect(file()).rejects.toMatchObject({ code: "CONFLICT" });
		});
	});

	it("rejects a missing reason or text (AC-F8)", async () => {
		await openLessons(4);
		await expect(file({ text: "   " })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		await expect(file({ reason: "because" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("returns NOT_FOUND for another student's payment and with the flag off (AC-C1, AC-C24)", async () => {
		await openLessons(4);
		const other = await makeUser();
		await expect(
			refundAppealService.fileAppeal(other.id, {
				paymentId,
				reason: "other",
				text: "x",
				files: [],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		flag.on = false;
		await expect(file()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await testDb.refundAppeal.count()).toBe(0);
	});

	it("stores accepted files privately under random names (C20, C21)", async () => {
		await openLessons(4);

		const { appealId } = await file({ files: [png("my receipt.png")] });

		const files = await testDb.refundEvidenceFile.findMany({
			where: { appealId },
		});
		expect(files).toHaveLength(1);
		expect(files[0]).toMatchObject({
			uploadedBy: "student",
			fileName: "my receipt.png",
			contentType: "image/png",
		});
		expect(files[0]?.blobPathname).not.toContain("receipt");
		expect(blob.put).toHaveBeenCalledWith(
			expect.stringMatching(/^refund-evidence\//),
			expect.anything(),
			expect.objectContaining({
				access: "private",
				token: "test-private-token",
			}),
		);
	});

	it("uploads nothing when a file is refused by its content", async () => {
		await openLessons(4);

		await expect(file({ files: [svgAsPng()] })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(blob.put).not.toHaveBeenCalled();
	});

	it("deletes the uploaded files when the appeal cannot be stored", async () => {
		await openLessons(4);
		const { refundAppealRepository } = await import(
			"@/server/repositories/refundAppeal.repository"
		);
		// A concurrent filing wins between the pre-check and the transaction.
		vi.spyOn(refundAppealRepository, "createAppealInTx").mockRejectedValueOnce(
			new Error("insert failed"),
		);

		await expect(file({ files: [png()] })).rejects.toThrow("insert failed");
		expect(blob.del).toHaveBeenCalledWith(
			[expect.stringMatching(/^refund-evidence\//)],
			expect.anything(),
		);
		expect(await testDb.refundRequest.count()).toBe(0);
	});

	it("emails each admin once that an appeal was filed, without the student's text", async () => {
		await openLessons(4);

		await file();

		const filed = send.mock.calls.filter(
			([arg]) => arg.templateKey === "admin.appeal-filed",
		);
		expect(filed).toHaveLength(1);
		expect(JSON.stringify(filed)).not.toContain("placeholders");
		expect(instructorId).toBeTruthy();
	});
});
