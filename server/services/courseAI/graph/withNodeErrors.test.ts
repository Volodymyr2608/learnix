import { describe, expect, it, vi } from "vitest";
import {
	FatalNodeError,
	RetryableNodeError,
} from "@/server/services/courseAI/courseAI.errors";
import { withNodeErrors } from "./withNodeErrors";

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: { error: vi.fn() },
}));

vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));

const state = {} as never;

describe("withNodeErrors", () => {
	it("passes a successful node result through untouched", async () => {
		const node = withNodeErrors("validate", async () => ({
			validationErrors: null,
		}));

		await expect(node(state)).resolves.toEqual({ validationErrors: null });
	});

	it("rethrows a provider timeout as RetryableNodeError", async () => {
		const node = withNodeErrors("chat_response", async () => {
			throw Object.assign(new Error("upstream boom"), { name: "TimeoutError" });
		});

		await expect(node(state)).rejects.toBeInstanceOf(RetryableNodeError);
	});

	it("rethrows a programming error as FatalNodeError", async () => {
		const node = withNodeErrors("validate", async () => {
			throw new TypeError("x is not a function");
		});

		await expect(node(state)).rejects.toBeInstanceOf(FatalNodeError);
	});

	it("rethrows a client abort untouched and does not log it", async () => {
		// An instructor navigating away is not a failure — counting it would
		// poison the failure-rate signal workstream D is built on.
		mockLogger.error.mockClear();
		const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
		const node = withNodeErrors("clarify", async () => {
			throw abort;
		});

		await expect(node(state)).rejects.toBe(abort);
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("logs the node name and the error kind structurally", async () => {
		mockLogger.error.mockClear();
		const node = withNodeErrors("extract_step_data", async () => {
			throw Object.assign(new Error("rate limited"), {
				lc_error_code: "MODEL_RATE_LIMIT",
			});
		});

		await expect(node(state)).rejects.toBeInstanceOf(RetryableNodeError);
		const [fields] = mockLogger.error.mock.calls[0] ?? [];
		expect(fields).toMatchObject({
			feature: "courseAI",
			node: "extract_step_data",
			kind: "retryable",
		});
	});
});
