import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makeEvidenceFile,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => flag.on,
}));
const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/env")>();
	return {
		env: { ...actual.env, REFUND_EVIDENCE_BLOB_TOKEN: "test-private-token" },
	};
});

const { userService } = await import("./user.service");

const callerFor = (id: string, role: Role = Role.STUDENT) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

describe("account deletion and refunds (FR-P23, EC-12, AC-F20, AC-C29)", () => {
	let studentId: string;
	let instructorId: string;

	const purchase = async (title: string) => {
		const course = await makeCourse({ instructorId, title });
		const payment = await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
		});
		return { course, payment };
	};

	beforeEach(async () => {
		flag.on = true;
		await truncateAll();
		vi.clearAllMocks();
		blob.del.mockResolvedValue(undefined);
		instructorId = (await makeUser({ role: "INSTRUCTOR" })).id;
		studentId = (await makeUser()).id;
	});

	it("erases texts and file names, closes the open appeal, keeps numbers and audit, deletes the files", async () => {
		const { course, payment } = await purchase("Rust");
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId: course.id,
			decision: "auto_denied",
			text: "my private reason",
			snapshot: { openedCount: 4, threshold: 3 },
		});
		const appeal = await makeAppeal({
			requestId: request.id,
			text: "my appeal",
		});
		const file = await makeEvidenceFile({
			appealId: appeal.id,
			fileName: "passport.png",
		});
		await testDb.refundAudit.create({
			data: { kind: "exception", paymentId: payment.id, reason: "admin note" },
		});

		await userService.anonymiseAccount(studentId);

		expect(
			await testDb.refundRequest.findUniqueOrThrow({
				where: { id: request.id },
			}),
		).toMatchObject({ text: null, snapshot: { openedCount: 4, threshold: 3 } });
		expect(
			await testDb.refundAppeal.findUniqueOrThrow({ where: { id: appeal.id } }),
		).toMatchObject({ text: "", status: "closed_account_deleted" });
		const stored = await testDb.refundEvidenceFile.findUniqueOrThrow({
			where: { id: file.id },
		});
		expect(stored.fileName).toBe("deleted");
		expect(stored.deletedAt).not.toBeNull();
		expect(blob.del).toHaveBeenCalledWith([file.blobPathname], {
			token: "test-private-token",
		});
		expect(await testDb.refundAudit.count()).toBe(1);
		expect(
			(
				await testDb.refundRequest.findUniqueOrThrow({
					where: { id: request.id },
				})
			).approval,
		).toBeNull();
	});

	it("leaves a refund already processing to complete (EC-12)", async () => {
		const { course, payment } = await purchase("Go");
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId: course.id,
			decision: "auto_approved",
			refundState: "processing",
		});

		await userService.anonymiseAccount(studentId);

		expect(
			await testDb.refundRequest.findUniqueOrThrow({
				where: { id: request.id },
			}),
		).toMatchObject({ refundState: "processing", approval: "automatic" });
	});

	it("still deletes the account when a blob delete fails (the daily retention catches it)", async () => {
		const { course, payment } = await purchase("Rust");
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId: course.id,
			decision: "auto_denied",
		});
		const appeal = await makeAppeal({ requestId: request.id });
		const file = await makeEvidenceFile({ appealId: appeal.id });
		blob.del.mockRejectedValueOnce(new Error("blob down"));

		await expect(
			userService.anonymiseAccount(studentId),
		).resolves.not.toThrow();
		expect(
			(
				await testDb.refundEvidenceFile.findUniqueOrThrow({
					where: { id: file.id },
				})
			).deletedAt,
		).toBeNull();
	});

	describe("refund.openAppeals feeds the deletion warning (EC-12)", () => {
		it("lists the courses of the student's open appeals", async () => {
			const { course, payment } = await purchase("Rust");
			const request = await makeRefundRequest({
				paymentId: payment.id,
				studentId,
				courseId: course.id,
				decision: "auto_denied",
			});
			await makeAppeal({ requestId: request.id });

			expect(await callerFor(studentId).refund.openAppeals()).toEqual(["Rust"]);
		});

		it("is empty for an instructor and with the flag off", async () => {
			expect(
				await callerFor(instructorId, Role.INSTRUCTOR).refund.openAppeals(),
			).toEqual([]);
			flag.on = false;
			expect(await callerFor(studentId).refund.openAppeals()).toEqual([]);
		});
	});
});
