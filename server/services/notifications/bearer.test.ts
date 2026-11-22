import { describe, expect, it } from "vitest";
import { bearerMatches } from "./auth";

const req = (authorization?: string) =>
	new Request("http://localhost/x", {
		headers: authorization ? { authorization } : {},
	});

describe("bearerMatches (H8)", () => {
	it("accepts exactly `Bearer <secret>`", () => {
		expect(bearerMatches(req("Bearer abc123"), "abc123")).toBe(true);
	});

	it.each([
		["no header", undefined],
		["a wrong secret", "Bearer abc124"],
		["another length", "Bearer abc1234"],
		["no scheme", "abc123"],
	])("rejects %s", (_label, header) => {
		expect(bearerMatches(req(header), "abc123")).toBe(false);
	});
});
