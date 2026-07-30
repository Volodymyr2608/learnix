import { describe, expect, it } from "vitest";
import { classifyNodeError, isNodeAbort } from "./nodeErrors";

/** LangChain hands nodes plain Errors with extra fields — see wrapOpenAIClientError. */
const providerError = (fields: Record<string, unknown>): Error =>
	Object.assign(new Error("upstream boom"), fields);

/**
 * The real shape: the openai SDK never assigns `this.name`, so an instance's
 * `.name` is "Error" and only `constructor.name` identifies the class. Faking a
 * `name` here would make the test pass against a shape that never occurs.
 */
class APIConnectionError extends Error {}

describe("classifyNodeError", () => {
	it("treats a LangChain-rewritten timeout as retryable", () => {
		const result = classifyNodeError(
			providerError({ name: "TimeoutError" }),
			"chat_response",
		);

		expect(result.retryable).toBe(true);
	});

	it("treats a rate limit as retryable via lc_error_code, not via status", () => {
		// wrapOpenAIClientError only tags the error; status stays on the object but
		// the tag is the stable signal.
		const result = classifyNodeError(
			providerError({ lc_error_code: "MODEL_RATE_LIMIT", status: 429 }),
			"extract_step_data",
		);

		expect(result.retryable).toBe(true);
	});

	it("treats a network fault with no status and no name as retryable", () => {
		// wrapOpenAIClientError passes APIConnectionError through untouched: no
		// rename, no lc_error_code, and status is undefined. Only the constructor
		// name identifies it.
		const fault = new APIConnectionError("Connection error.");
		expect(fault.name).toBe("Error");
		expect((fault as { status?: number }).status).toBeUndefined();

		const result = classifyNodeError(fault, "tool_router");

		expect(result.retryable).toBe(true);
	});

	it("treats a 5xx passthrough as retryable", () => {
		const result = classifyNodeError(
			providerError({ status: 503 }),
			"confidence_score",
		);

		expect(result.retryable).toBe(true);
	});

	it("treats a structured-output parse failure as fatal", () => {
		const result = classifyNodeError(
			providerError({ lc_error_code: "OUTPUT_PARSING_FAILURE" }),
			"extract_step_data",
		);

		expect(result.retryable).toBe(false);
	});

	it("treats a bad API key as fatal", () => {
		const result = classifyNodeError(
			providerError({ lc_error_code: "MODEL_AUTHENTICATION", status: 401 }),
			"clarify",
		);

		expect(result.retryable).toBe(false);
	});

	it("treats a programming error as fatal", () => {
		const result = classifyNodeError(
			new TypeError("x is not a function"),
			"validate",
		);

		expect(result.retryable).toBe(false);
	});

	it("fails closed: an unrecognised shape is fatal, not retryable", () => {
		// Telling an instructor to retry a bug trains them to retry it forever.
		const result = classifyNodeError({ weird: true }, "persist_and_emit");

		expect(result.retryable).toBe(false);
	});

	it("does not treat a client abort as a classifiable failure", () => {
		// Under streamEvents, @langchain/core throws ModelAbortError — not a
		// DOMException — for every .invoke() node when the signal trips. Missing it
		// files an instructor who navigated away as a fatal failure.
		expect(
			isNodeAbort(Object.assign(new Error("x"), { name: "AbortError" })),
		).toBe(true);
		expect(
			isNodeAbort(
				Object.assign(new Error("Model invocation was aborted."), {
					name: "ModelAbortError",
				}),
			),
		).toBe(true);
		expect(isNodeAbort(new TypeError("x is not a function"))).toBe(false);
	});

	it("names the node and keeps the original error as cause, without copying its message", () => {
		const original = providerError({ name: "TimeoutError" });

		const result = classifyNodeError(original, "chat_response");

		expect(result.message).toBe('[courseAI.graph] node "chat_response" failed');
		expect(result.cause).toBe(original);
	});
});
