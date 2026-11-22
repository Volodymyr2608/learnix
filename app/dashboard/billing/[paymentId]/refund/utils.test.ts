import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { isRefundPageNotFound } from "./utils";

describe("isRefundPageNotFound (AC-C1, audit L-1)", () => {
	it.each([
		"NOT_FOUND",
		"BAD_REQUEST",
	] as const)("treats %s as a plain 404", (code) => {
		expect(isRefundPageNotFound(new TRPCError({ code }))).toBe(true);
	});

	it.each([
		"INTERNAL_SERVER_ERROR",
		"UNAUTHORIZED",
	] as const)("lets %s reach the error boundary", (code) => {
		expect(isRefundPageNotFound(new TRPCError({ code }))).toBe(false);
	});

	it("lets a non-tRPC error through", () => {
		expect(isRefundPageNotFound(new Error("boom"))).toBe(false);
	});
});
