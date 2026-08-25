import { beforeEach, describe, expect, it, vi } from "vitest";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/server/observability/reportError", () => ({ reportError }));

const { logger } = await import("./logger");

describe("logger reporter (spec.md AC 5)", () => {
	beforeEach(() => {
		reportError.mockClear();
	});

	it("forwards logger.error to reportError", () => {
		const error = new Error("boom");
		logger.error("update failed", error);

		expect(reportError).toHaveBeenCalledTimes(1);
		expect(reportError).toHaveBeenCalledWith(error, "update failed");
	});

	it("does not forward logger.info", () => {
		logger.info("just fyi", { a: 1 });

		expect(reportError).not.toHaveBeenCalled();
	});

	it("does not forward logger.warn", () => {
		logger.warn("careful", { a: 1 });

		expect(reportError).not.toHaveBeenCalled();
	});

	it("does not forward logger.debug or logger.log", () => {
		logger.debug("debugging", { a: 1 });
		logger.log("logging", { a: 1 });

		expect(reportError).not.toHaveBeenCalled();
	});

	// message-first: `logger.error("some message", errorOrDataObject)` — the
	// shape used at, e.g., user.service.ts:12.
	it("normalizes a message-first call (string, error)", () => {
		const error = new Error("db down");
		logger.error("Failed to update user:", error);

		expect(reportError).toHaveBeenCalledWith(error, "Failed to update user:");
	});

	// error-first: `logger.error(error, "some message")` — the shape used at
	// guardUserInput.ts:103 and lessonAI.service.ts:158.
	it("normalizes an error-first call (error, string)", () => {
		const error = new Error("L2 down");
		logger.error(error, "[aiGuard] L2 unavailable — failing open");

		expect(reportError).toHaveBeenCalledWith(
			error,
			"[aiGuard] L2 unavailable — failing open",
		);
	});

	// message-first with a plain data object (not an Error instance) — the
	// shape used at email.service.ts:62-66 and review.service.ts:120.
	it("normalizes a message-first call whose second argument is a plain object", () => {
		const data = {
			templateKey: "welcome",
			toEmail: "student@example.com",
			error: new Error("send failed"),
		};
		logger.error("resend_failed", data);

		expect(reportError).toHaveBeenCalledWith(data, "resend_failed");
	});

	// bare single-argument call — courseAI.service.ts:42/:74,
	// courseGeneration.repository.ts:41.
	it("normalizes a bare single-argument call to a generic static message", () => {
		const error = new Error("boom");
		logger.error(error);

		expect(reportError).toHaveBeenCalledTimes(1);
		const [forwardedError, forwardedMessage] = reportError.mock.calls[0] ?? [];
		expect(forwardedError).toBe(error);
		expect(typeof forwardedMessage).toBe("string");
		expect((forwardedMessage as string).length).toBeGreaterThan(0);
	});
});
