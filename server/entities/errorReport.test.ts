import { describe, expect, it } from "vitest";
import { errorReportInput } from "./errorReport";

describe("errorReportInput", () => {
	const valid = {
		digest: "a1b2c3d4",
		errorClass: "TypeError",
		route: "/dashboard/courses",
	};

	it("accepts a valid closed-shape payload", () => {
		expect(errorReportInput.parse(valid)).toEqual(valid);
	});

	it("accepts a payload with digest omitted (RSC-only field)", () => {
		const { digest, ...withoutDigest } = valid;
		expect(errorReportInput.parse(withoutDigest)).toEqual(withoutDigest);
	});

	it("rejects a payload missing errorClass", () => {
		const { errorClass, ...withoutErrorClass } = valid;
		expect(() => errorReportInput.parse(withoutErrorClass)).toThrow();
	});

	it("rejects a payload missing route", () => {
		const { route, ...withoutRoute } = valid;
		expect(() => errorReportInput.parse(withoutRoute)).toThrow();
	});

	it("strips a free-text message field rather than transmitting it — this IS the S5 control", () => {
		const withMessage = {
			...valid,
			message: "attacker-chosen text aimed at whoever reads the issue stream",
		};

		const parsed = errorReportInput.parse(withMessage);

		expect(parsed).toEqual(valid);
		expect(parsed).not.toHaveProperty("message");
	});

	it("strips any other unknown/extra field", () => {
		const withExtra = { ...valid, stack: "at foo (bar.js:1:1)", extra: "x" };

		const parsed = errorReportInput.parse(withExtra);

		expect(parsed).toEqual(valid);
	});

	it("rejects an oversized errorClass", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, errorClass: "x".repeat(200) }),
		).toThrow();
	});

	it("rejects an oversized route", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, route: `/${"x".repeat(400)}` }),
		).toThrow();
	});

	it("rejects an oversized digest", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, digest: "x".repeat(200) }),
		).toThrow();
	});

	it("rejects an empty-string errorClass", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, errorClass: "" }),
		).toThrow();
	});

	it("rejects an empty-string route", () => {
		expect(() => errorReportInput.parse({ ...valid, route: "" })).toThrow();
	});
});
