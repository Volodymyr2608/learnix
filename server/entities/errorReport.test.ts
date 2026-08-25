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

	it("rejects an errorClass that is a readable free-text phrase within the length cap", () => {
		expect(() =>
			errorReportInput.parse({
				...valid,
				errorClass: "click here for free money",
			}),
		).toThrow();
	});

	it("rejects a route containing free-text content within the length cap", () => {
		expect(() =>
			errorReportInput.parse({
				...valid,
				route: "/click here for free money",
			}),
		).toThrow();
	});

	it("rejects an errorClass that doesn't start with a letter", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, errorClass: "1TypeError" }),
		).toThrow();
	});

	it("rejects a route that doesn't start with a slash", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, route: "dashboard/courses" }),
		).toThrow();
	});

	it("accepts a real JS built-in Error.name value", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, errorClass: "TypeError" }),
		).not.toThrow();
	});

	it("accepts a real tRPC TRPC_ERROR_CODE_KEY value", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, errorClass: "UNAUTHORIZED" }),
		).not.toThrow();
	});

	it("accepts the fallback errorClass used when a tRPC error carries no code", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, errorClass: "TRPCClientError" }),
		).not.toThrow();
	});

	it("accepts a real nested dynamic-segment route", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, route: "/dashboard/courses/abc123" }),
		).not.toThrow();
	});

	it("accepts the root route", () => {
		expect(() =>
			errorReportInput.parse({ ...valid, route: "/" }),
		).not.toThrow();
	});
});
