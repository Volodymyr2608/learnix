import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makeEvidenceFile,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/env")>();
	return {
		env: { ...actual.env, REFUND_EVIDENCE_BLOB_TOKEN: "test-private-token" },
	};
});

const { evidenceRetentionService } = await import(
	"./evidenceRetention.service"
);

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-12-31T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

describe("evidence is deleted 30 days after the decision (FR-P22, AC-F18)", () => {
	const appealWithFile = async (
		status: "open" | "denied" | "approved",
		decidedAt: Date | null,
	) => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: student.id,
			courseId: course.id,
			decision: "auto_denied",
		});
		const appeal = await makeAppeal({
			requestId: request.id,
			status,
			decidedAt,
		});
		const file = await makeEvidenceFile({ appealId: appeal.id });
		return { appeal, file };
	};

	const deletedAt = async (fileId: string) =>
		(
			await testDb.refundEvidenceFile.findUniqueOrThrow({
				where: { id: fileId },
			})
		).deletedAt;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		blob.del.mockResolvedValue(undefined);
	});

	it("deletes files of a decision 30 days old, and not of one 29 days old", async () => {
		const old = await appealWithFile("denied", daysAgo(30));
		const recent = await appealWithFile("approved", daysAgo(29));

		expect(await evidenceRetentionService.deleteExpired(NOW)).toBe(1);

		expect(await deletedAt(old.file.id)).toEqual(NOW);
		expect(await deletedAt(recent.file.id)).toBeNull();
		expect(blob.del).toHaveBeenCalledWith([old.file.blobPathname], {
			token: "test-private-token",
		});
	});

	it("never touches an undecided appeal", async () => {
		const open = await appealWithFile("open", null);

		expect(await evidenceRetentionService.deleteExpired(NOW)).toBe(0);
		expect(await deletedAt(open.file.id)).toBeNull();
		expect(blob.del).not.toHaveBeenCalled();
	});

	it("keeps the row for the next run when the blob delete fails; texts stay", async () => {
		const old = await appealWithFile("denied", daysAgo(40));
		blob.del.mockRejectedValueOnce(new Error("blob down"));

		expect(await evidenceRetentionService.deleteExpired(NOW)).toBe(0);
		expect(await deletedAt(old.file.id)).toBeNull();
		expect(
			(
				await testDb.refundAppeal.findUniqueOrThrow({
					where: { id: old.appeal.id },
				})
			).text,
		).not.toBe("");

		expect(await evidenceRetentionService.deleteExpired(NOW)).toBe(1);
	});

	it("runs from the daily watchdog", async () => {
		const spy = vi
			.spyOn(evidenceRetentionService, "deleteExpired")
			.mockResolvedValue(0);
		const { payoutWatchdogService } = await import(
			"@/server/services/payments/payoutWatchdog.service"
		);

		await payoutWatchdogService.check(NOW);

		expect(spy).toHaveBeenCalledWith(NOW);
	});
});
