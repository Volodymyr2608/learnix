import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { shouldReport } from "./shouldReport";

describe("shouldReport", () => {
	it.each([
		"UNAUTHORIZED",
		"FORBIDDEN",
		"NOT_FOUND",
		"BAD_REQUEST",
		"TOO_MANY_REQUESTS",
		"CONFLICT",
	] as const)("does not report client-fault code %s", (code) => {
		expect(shouldReport(new TRPCError({ code }))).toBe(false);
	});

	it("reports INTERNAL_SERVER_ERROR", () => {
		expect(shouldReport(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }))).toBe(
			true,
		);
	});

	it("reports an unmapped throw", () => {
		expect(shouldReport(new Error("boom"))).toBe(true);
		expect(shouldReport("a string")).toBe(true);
	});
});
