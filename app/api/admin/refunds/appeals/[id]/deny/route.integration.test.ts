import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	EvidenceRejectedError,
	RefundAppealConflictError,
	RefundAppealInputError,
	RefundAppealNotFoundError,
} from "@/server/services/refund/refund.errors";

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
const denyAppeal = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/refund/refundAppealAdmin.service", () => ({
	refundAppealAdminService: { denyAppeal },
}));

const { POST } = await import("./route");

const call = (files: File[] = [], reason = "Not eligible.") => {
	const body = new FormData();
	body.set("reason", reason);
	for (const f of files) body.append("files", f);
	return POST(new Request("http://localhost/x", { method: "POST", body }), {
		params: Promise.resolve({ id: "ap_1" }),
	});
};

const as = (role: string) =>
	mockGetSession.mockResolvedValue({
		user: { id: "u_1", role },
		session: { id: "s" },
	});

describe("POST /api/admin/refunds/appeals/[id]/deny (V13, C17)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		denyAppeal.mockResolvedValue(undefined);
	});

	it.each([
		"STUDENT",
		"INSTRUCTOR",
	])("returns 404 to a %s and denies nothing", async (role) => {
		as(role);
		expect((await call()).status).toBe(404);
		expect(denyAppeal).not.toHaveBeenCalled();
	});

	it("returns 404 without a session", async () => {
		mockGetSession.mockResolvedValue(null);
		expect((await call()).status).toBe(404);
	});

	it("denies as the session's admin with the reason and the files", async () => {
		as("ADMIN");
		const pdf = new File(["%PDF-"], "terms.pdf", { type: "application/pdf" });

		const res = await call([pdf]);

		expect(res.status).toBe(204);
		const [adminId, appealId, input] = denyAppeal.mock.calls[0] ?? [];
		expect([adminId, appealId, input.reason, input.files.length]).toEqual([
			"u_1",
			"ap_1",
			"Not eligible.",
			1,
		]);
	});

	it.each([
		[new RefundAppealNotFoundError(), 404],
		[new RefundAppealConflictError("x"), 409],
		[new RefundAppealInputError("x"), 422],
		[new EvidenceRejectedError("type"), 415],
		[new EvidenceRejectedError("size"), 413],
	])("maps %s to %i", async (error, status) => {
		as("ADMIN");
		denyAppeal.mockRejectedValueOnce(error);
		expect((await call()).status).toBe(status);
	});
});
