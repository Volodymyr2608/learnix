import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	EvidenceRejectedError,
	RefundAppealConflictError,
	RefundAppealInputError,
	RefundBusyError,
	RefundNotFoundError,
} from "@/server/services/refund/refund.errors";

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
const fileAppeal = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/refund/refundAppeal.service", () => ({
	refundAppealService: { fileAppeal },
}));

const { POST } = await import("./route");

const form = (files: File[] = []) => {
	const body = new FormData();
	body.set("paymentId", "pay_1");
	body.set("reason", "other");
	body.set("text", "Because.");
	for (const f of files) body.append("files", f);
	return new Request("http://localhost/api/refunds/appeals", {
		method: "POST",
		body,
	});
};

const asStudent = () =>
	mockGetSession.mockResolvedValue({
		user: { id: "stu_1", role: "STUDENT" },
		session: { id: "s" },
	});

describe("POST /api/refunds/appeals (V8)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fileAppeal.mockResolvedValue({ appealId: "ap_1" });
	});

	it("returns 401 without a session and 403 for a non-student", async () => {
		mockGetSession.mockResolvedValue(null);
		expect((await POST(form())).status).toBe(401);
		mockGetSession.mockResolvedValue({
			user: { id: "i", role: "INSTRUCTOR" },
			session: { id: "s" },
		});
		expect((await POST(form())).status).toBe(403);
		expect(fileAppeal).not.toHaveBeenCalled();
	});

	it("files the appeal for the session's student with the text and the files", async () => {
		asStudent();
		const png = new File([new Uint8Array([0x89, 0x50])], "a.png", {
			type: "image/png",
		});

		const res = await POST(form([png]));

		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ appealId: "ap_1" });
		const [studentId, input] = fileAppeal.mock.calls[0] ?? [];
		expect(studentId).toBe("stu_1");
		expect(input).toMatchObject({
			paymentId: "pay_1",
			reason: "other",
			text: "Because.",
		});
		expect(input.files).toHaveLength(1);
	});

	it("ignores an empty file input", async () => {
		asStudent();
		await POST(form([new File([], "", { type: "application/octet-stream" })]));
		expect(fileAppeal.mock.calls[0]?.[1].files).toEqual([]);
	});

	it.each([
		[new RefundNotFoundError(), 404],
		[new RefundAppealConflictError("x"), 409],
		[new RefundAppealInputError("x"), 422],
		[new EvidenceRejectedError("type"), 415],
		[new EvidenceRejectedError("size"), 413],
		[new EvidenceRejectedError("count"), 413],
		[new RefundBusyError(), 429],
	])("maps %s to %i", async (error, status) => {
		asStudent();
		fileAppeal.mockRejectedValueOnce(error);

		const res = await POST(form());

		expect(res.status).toBe(status);
	});

	it("rejects a body over the size limit before parsing it", async () => {
		asStudent();
		const req = new Request("http://localhost/api/refunds/appeals", {
			method: "POST",
			headers: { "content-length": String(6 * 1024 * 1024) },
			body: "x",
		});

		expect((await POST(req)).status).toBe(413);
		expect(fileAppeal).not.toHaveBeenCalled();
	});
});
