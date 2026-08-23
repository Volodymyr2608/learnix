import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { enrichScope } = vi.hoisted(() => ({ enrichScope: vi.fn() }));
vi.mock("@/server/observability/reportError", () => ({ enrichScope }));

const { handleServiceError } = await import("./handleServiceError");
const { DomainError } = await import("@/server/services/base/base.errors");

class CourseError extends DomainError {}

const PAYLOAD = "SECRET_LESSON_BODY";

describe("handleServiceError", () => {
	beforeEach(() => enrichScope.mockClear());

	it("rethrows a TRPCError untouched", () => {
		const original = new TRPCError({ code: "NOT_FOUND", message: "nope" });
		expect(() => handleServiceError(original)).toThrow(original);
	});

	it("maps a DomainError's code and message", () => {
		const error = new CourseError("Course not found", "NOT_FOUND");
		expect(() => handleServiceError(error)).toThrow(
			expect.objectContaining({
				code: "NOT_FOUND",
				message: "Course not found",
			}),
		);
	});

	it("attaches DomainError.context to the scope", () => {
		// Fixture taken from a real site: course.service.ts:109-111.
		const error = new CourseError("Course not found", "NOT_FOUND", undefined, {
			courseId: "c1",
		});

		expect(() => handleServiceError(error)).toThrow();
		expect(enrichScope).toHaveBeenCalledWith("domainError", { courseId: "c1" });
	});

	it("does not enrich when a DomainError carries no context", () => {
		expect(() => handleServiceError(new CourseError("plain"))).toThrow();
		expect(enrichScope).not.toHaveBeenCalledWith(
			"domainError",
			expect.anything(),
		);
	});

	it("does not leak an unmapped Error.message to the client", () => {
		// The live shape: lessonInsightsAI does not wrap its chain invokes, and
		// OutputParserException embeds the entire model output in `message`.
		const parserError = Object.assign(
			new Error(`Failed to parse. Text: "${PAYLOAD}"`),
			{ name: "OutputParserException" },
		);

		try {
			handleServiceError(parserError);
			expect.unreachable("should have thrown");
		} catch (thrown) {
			const error = thrown as TRPCError;
			expect(error.code).toBe("INTERNAL_SERVER_ERROR");
			expect(error.message).toBe("An unexpected error occurred");
			expect(error.message).not.toContain(PAYLOAD);
		}
	});

	it("preserves the original as cause for server-side telemetry", () => {
		const original = new Error("boom");
		try {
			handleServiceError(original);
			expect.unreachable("should have thrown");
		} catch (thrown) {
			expect((thrown as TRPCError).cause).toBe(original);
		}
	});

	it("records the class name of an unmapped error", () => {
		class WeirdError extends Error {}
		expect(() => handleServiceError(new WeirdError("x"))).toThrow();
		expect(enrichScope).toHaveBeenCalledWith("errorClass", {
			name: "WeirdError",
		});
	});

	it("handles a non-Error throw", () => {
		expect(() => handleServiceError("a string")).toThrow(
			expect.objectContaining({ message: "An unexpected error occurred" }),
		);
	});
});
