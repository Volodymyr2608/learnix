import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/user.repository", () => ({
	userRepository: { anonymiseAccount: vi.fn(), update: vi.fn() },
}));
vi.mock("@/server/utils/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { userRepository } = await import(
	"@/server/repositories/user.repository"
);
const { userService } = await import("./user.service");
const { UserError } = await import("./user.errors");

describe("userService.anonymiseAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
