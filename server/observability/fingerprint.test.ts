import { describe, expect, it } from "vitest";
import { fingerprintFor, fingerprintKeyOf } from "./fingerprint";

describe("fingerprintFor", () => {
	it("groups two same-class errors with different text into one issue", () => {
		// The control: if the message contributed, anyone who can vary text inside an
		// error could fragment one real error into a thousand issues to bury it
		// (security.md S4).
		const a = new Error("lesson says foo");
		const b = new Error("lesson says bar");
		const context = { path: "lessonInsightsAI.generate" };

		expect(fingerprintFor(a, context)).toEqual(fingerprintFor(b, context));
	});

	it("separates different call sites", () => {
		const error = new Error("x");
		expect(fingerprintFor(error, { path: "course.get" })).not.toEqual(
			fingerprintFor(error, { path: "lesson.get" }),
		);
	});

	it("separates different error classes at one site", () => {
		class CourseError extends Error {}
		const context = { path: "course.get" };

		expect(fingerprintFor(new CourseError("a"), context)).not.toEqual(
			fingerprintFor(new TypeError("a"), context),
		);
	});

	it("falls back through path, op, feature", () => {
		expect(fingerprintFor(new Error("x"), { op: "getCourseById" })[0]).toBe(
			"getCourseById",
		);
		expect(fingerprintFor(new Error("x"), { feature: "lessonAI" })[0]).toBe(
			"lessonAI",
		);
		expect(fingerprintFor(new Error("x"))[0]).toBe("unknown");
	});

	it("never contains the message", () => {
		const secret = "SECRET_LESSON_BODY";
		expect(
			fingerprintFor(new Error(secret), { path: "p" }).join("|"),
		).not.toContain(secret);
	});
});

describe("fingerprintKeyOf", () => {
	it("prefers the explicit fingerprint", () => {
		expect(
			fingerprintKeyOf({ fingerprint: ["course.get", "CourseError"] }),
		).toBe("course.get|CourseError");
	});

	it("falls back to the exception type, then to unknown", () => {
		expect(
			fingerprintKeyOf({ exception: { values: [{ type: "UpstashError" }] } }),
		).toBe("UpstashError");
		expect(fingerprintKeyOf({})).toBe("unknown");
	});
});
