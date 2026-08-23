import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureException, captureMessage, setTag, setContext } = vi.hoisted(
	() => ({
		captureException: vi.fn(),
		captureMessage: vi.fn(),
		setTag: vi.fn(),
		setContext: vi.fn(),
	}),
);

vi.mock("@sentry/nextjs", async (importOriginal) => ({
	...(await importOriginal<object>()),
	captureException,
	captureMessage,
	getIsolationScope: () => ({ setTag, setContext }),
}));

const { reportError, reportMessage, enrichScope } = await import(
	"./reportError"
);

const PAYLOAD = "SECRET_LESSON_BODY";

const serialiseCapture = (): string => {
	const [root, options] = captureException.mock.calls[0] ?? [];
	const chain: unknown[] = [];
	let cursor: unknown = root;
	while (cursor instanceof Error) {
		chain.push({
			name: cursor.name,
			message: cursor.message,
			...(cursor as unknown as Record<string, unknown>),
		});
		cursor = (cursor as { cause?: unknown }).cause;
	}
	return JSON.stringify({ chain, options });
};

describe("reportError", () => {
	beforeEach(() => {
		captureException.mockClear();
		captureMessage.mockClear();
		setTag.mockClear();
		setContext.mockClear();
	});

	it("captures once per error instance and only tags on the second call", () => {
		// lib/requests/** reaches procedures through createCaller, so an error is seen
		// by the tRPC middleware AND by safeRequest. Without the marker that is two
		// events per RSC failure across all 34 call sites (AC 2).
		const error = new Error("boom");

		reportError(error, "trpc_procedure_failed", { path: "course.get" });
		reportError(error, "safeRequest:getCourseById", { op: "getCourseById" });

		expect(captureException).toHaveBeenCalledTimes(1);
		expect(setTag).toHaveBeenCalledWith("operation", "getCourseById");
	});

	it("never transmits the error message", () => {
		const error = Object.assign(
			new Error(`Failed to parse. Text: "${PAYLOAD}"`),
			{ name: "OutputParserException" },
		);

		reportError(error, "trpc_procedure_failed", { path: "lessonInsightsAI.x" });

		expect(serialiseCapture()).not.toContain(PAYLOAD);
	});

	it("does not report client aborts", () => {
		// SSE routes abort routinely when a user navigates away (AC 41).
		const abort = Object.assign(new Error("aborted"), {
			name: "ModelAbortError",
		});

		reportError(abort, "stream_failed", { feature: "lessonAI" });

		expect(captureException).not.toHaveBeenCalled();
	});

	it("fingerprints from server-authored values, not the message", () => {
		reportError(new Error(PAYLOAD), "m", { path: "course.get" });

		const [, options] = captureException.mock.calls[0] ?? [];
		expect((options as { fingerprint: string[] }).fingerprint).toEqual([
			"course.get",
			"Error",
		]);
	});

	it("captures separate instances separately", () => {
		reportError(new Error("a"), "m", { path: "p" });
		reportError(new Error("b"), "m", { path: "p" });

		expect(captureException).toHaveBeenCalledTimes(2);
	});
});

describe("reportMessage", () => {
	beforeEach(() => captureMessage.mockClear());

	it("sends a warning with a server-authored fingerprint", () => {
		reportMessage("aiGuard:unsafe_tool_call", ["aiGuard", "unsafe_tool_call"], {
			feature: "lessonAI",
			userId: "u1",
		});

		expect(captureMessage).toHaveBeenCalledWith("aiGuard:unsafe_tool_call", {
			level: "warning",
			fingerprint: ["aiGuard", "unsafe_tool_call"],
			extra: { feature: "lessonAI", userId: "u1" },
		});
	});

	it("drops non-allowlisted context", () => {
		reportMessage("m", ["f"], {
			userId: "u1",
			// @ts-expect-error — must not survive the allowlist
			reply: PAYLOAD,
		});

		expect(JSON.stringify(captureMessage.mock.calls[0])).not.toContain(PAYLOAD);
	});
});

describe("enrichScope", () => {
	it("sets context without capturing", () => {
		captureException.mockClear();

		enrichScope("domainError", { courseId: "c1" });

		expect(setContext).toHaveBeenCalledWith("domainError", { courseId: "c1" });
		expect(captureException).not.toHaveBeenCalled();
	});
});
