import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/user.repository", () => ({
	userRepository: { anonymiseAccount: vi.fn(), update: vi.fn() },
}));
// anonymiseAccount also reads and deletes refund evidence (FR-P23). Unmocked,
// that read reached the database — fine locally against learnix_test, red in
// CI where the unit job has none.
vi.mock("@/server/repositories/refundAppeal.repository", () => ({
	refundAppealRepository: {
		findEvidenceOfStudent: vi.fn(),
		markEvidenceDeleted: vi.fn(),
	},
}));
vi.mock("@/server/services/refund/refundEvidenceStorage", () => ({
	refundEvidenceStorage: { del: vi.fn() },
}));
vi.mock("@/server/utils/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { userRepository } = await import(
	"@/server/repositories/user.repository"
);
const { refundAppealRepository } = await import(
	"@/server/repositories/refundAppeal.repository"
);
const { refundEvidenceStorage } = await import(
	"@/server/services/refund/refundEvidenceStorage"
);
const { userService } = await import("./user.service");
const { UserError } = await import("./user.errors");

describe("userService.anonymiseAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(refundAppealRepository.findEvidenceOfStudent).mockResolvedValue(
			[],
		);
	});

	it("delegates to the repository", async () => {
		vi.mocked(userRepository.anonymiseAccount).mockResolvedValue(undefined);

		await userService.anonymiseAccount("user-1");

		expect(userRepository.anonymiseAccount).toHaveBeenCalledWith("user-1");
	});

	it("wraps a repository failure in a UserError", async () => {
		vi.mocked(userRepository.anonymiseAccount).mockRejectedValue(
			new Error("connection lost"),
		);

		await expect(userService.anonymiseAccount("user-1")).rejects.toBeInstanceOf(
			UserError,
		);
	});

	it("deletes the student's evidence files only after the account is anonymised", async () => {
		const order: string[] = [];
		vi.mocked(refundAppealRepository.findEvidenceOfStudent).mockResolvedValue([
			{ id: "ev-1", blobPathname: "refund-evidence/a" },
		] as never);
		vi.mocked(userRepository.anonymiseAccount).mockImplementation(async () => {
			order.push("anonymise");
			return undefined as never;
		});
		vi.mocked(refundEvidenceStorage.del).mockImplementation(async () => {
			order.push("delete-blobs");
		});

		await userService.anonymiseAccount("user-1");

		expect(refundAppealRepository.findEvidenceOfStudent).toHaveBeenCalledWith(
			"user-1",
		);
		expect(order).toEqual(["anonymise", "delete-blobs"]);
		expect(refundAppealRepository.markEvidenceDeleted).toHaveBeenCalledWith(
			["ev-1"],
			expect.any(Date),
		);
	});

	it("keeps the deletion when the evidence files cannot be deleted yet", async () => {
		vi.mocked(refundAppealRepository.findEvidenceOfStudent).mockResolvedValue([
			{ id: "ev-1", blobPathname: "refund-evidence/a" },
		] as never);
		vi.mocked(userRepository.anonymiseAccount).mockResolvedValue(
			undefined as never,
		);
		vi.mocked(refundEvidenceStorage.del).mockRejectedValue(
			new Error("blob down"),
		);

		await expect(
			userService.anonymiseAccount("user-1"),
		).resolves.toBeUndefined();
		expect(refundAppealRepository.markEvidenceDeleted).not.toHaveBeenCalled();
	});
});
