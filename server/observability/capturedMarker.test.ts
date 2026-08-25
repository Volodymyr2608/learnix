import { describe, expect, it } from "vitest";
import { isCaptured, markCaptured } from "./capturedMarker";

describe("capturedMarker", () => {
	it("reports an unmarked error as not captured", () => {
		expect(isCaptured(new Error("boom"))).toBe(false);
	});

	it("marks and detects an error instance", () => {
		const error = new Error("boom");
		markCaptured(error);
		expect(isCaptured(error)).toBe(true);
	});

	it("marks per instance, not per class", () => {
		const first = new Error("a");
		markCaptured(first);
		expect(isCaptured(new Error("b"))).toBe(false);
	});

	it("is non-enumerable — it must not leak into any serialisation", () => {
		// A plain assignment would surface in Object.keys, in every spread of the
		// error, and in the JSON.stringify the redaction tests perform.
		const error = Object.assign(new Error("boom"), { visible: 1 });
		markCaptured(error);

		expect(Object.keys(error)).toEqual(["visible"]);
		expect(JSON.stringify({ ...error })).not.toContain("__sentryCaptured");
	});

	it("tolerates non-object throws", () => {
		expect(() => markCaptured("a string")).not.toThrow();
		expect(() => markCaptured(null)).not.toThrow();
		expect(isCaptured("a string")).toBe(false);
		expect(isCaptured(null)).toBe(false);
	});
});
