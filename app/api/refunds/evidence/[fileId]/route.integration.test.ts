import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makeEvidenceFile,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
const blob = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/env")>();
	return {
		env: { ...actual.env, REFUND_EVIDENCE_BLOB_TOKEN: "test-private-token" },
	};
});

const { GET } = await import("./route");

const call = (fileId: string) =>
	GET(new Request(`http://localhost/api/refunds/evidence/${fileId}`), {
		params: Promise.resolve({ fileId }),
	});

const sessionAs = (id: string, role: string) =>
	mockGetSession.mockResolvedValue({
		user: { id, role },
		session: { id: "s" },
	});

describe("GET /api/refunds/evidence/[fileId] (C20, C21)", () => {
	let studentId: string;
	let instructorId: string;
	let fileId: string;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		blob.get.mockResolvedValue({
			statusCode: 200,
			stream: new Blob(["%PDF-1.7 bytes"]).stream(),
			headers: new Headers(),
			blob: { contentType: "application/pdf", size: 14 },
		});
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
		const appeal = await makeAppeal({ requestId: request.id });
		const file = await makeEvidenceFile({
			appealId: appeal.id,
			fileName: 'my "proof".pdf',
			contentType: "application/pdf",
		});
		studentId = student.id;
		instructorId = instructor.id;
		fileId = file.id;
	});

	it("serves the payment's student a download with safe headers", async () => {
		sessionAs(studentId, "STUDENT");

		const res = await call(fileId);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/pdf");
		expect(res.headers.get("Content-Disposition")).toMatch(
			/^attachment; filename="my__proof_.pdf"$/,
		);
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(res.headers.get("Content-Security-Policy")).toBe("sandbox");
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
		expect(blob.get).toHaveBeenCalledWith(
			expect.stringMatching(/^refund-evidence\//),
			expect.objectContaining({
				access: "private",
				token: "test-private-token",
			}),
		);
	});

	it("serves an admin", async () => {
		const admin = await makeUser({ role: "ADMIN" });
		sessionAs(admin.id, "ADMIN");

		expect((await call(fileId)).status).toBe(200);
	});

	it.each([
		"another student",
		"the course's instructor",
		"nobody",
	])("returns 404 to %s", async (who) => {
		if (who === "another student") sessionAs((await makeUser()).id, "STUDENT");
		if (who === "the course's instructor")
			sessionAs(instructorId, "INSTRUCTOR");
		if (who === "nobody") mockGetSession.mockResolvedValue(null);

		const res = await call(fileId);

		expect(res.status).toBe(404);
		expect(blob.get).not.toHaveBeenCalled();
	});

	it("returns 404 for a deleted file", async () => {
		const { testDb } = await import("@/test/db");
		await testDb.refundEvidenceFile.update({
			where: { id: fileId },
			data: { deletedAt: new Date() },
		});
		sessionAs(studentId, "STUDENT");

		expect((await call(fileId)).status).toBe(404);
	});

	it("never stores evidence publicly (contract)", () => {
		const walk = (dir: string): string[] =>
			readdirSync(dir).flatMap((e) => {
				const f = join(dir, e);
				return statSync(f).isDirectory() ? walk(f) : [f];
			});
		const evidenceCode = walk("server/services/refund")
			.filter((f) => /evidence/i.test(f) && !f.endsWith(".test.ts"))
			.map((f) => readFileSync(f, "utf-8"));
		expect(evidenceCode.length).toBeGreaterThan(0);
		for (const source of evidenceCode)
			expect(source).not.toMatch(/access:\s*"public"/);
	});
});
