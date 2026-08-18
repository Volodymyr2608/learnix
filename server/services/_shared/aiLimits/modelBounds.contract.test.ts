import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every model call a user waits on has to be bounded, and the bound has to be
 * declared at the call site: a missing `timeout` is a request that hangs for as
 * long as the provider takes, and a missing `recursionLimit` is a graph that
 * loops until something else stops it.
 */
const ROOTS = ["server/services", "app/api/chat"];

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

/** Each `new ChatOpenAI({ … })` options object, with its file. */
const modelConstructions = (): Array<{ file: string; options: string }> =>
	ROOTS.flatMap(walk).flatMap((file) =>
		[
			...readFileSync(file, "utf-8").matchAll(/new ChatOpenAI\(\{[^{}]*\}/g),
		].map((match) => ({ file, options: match[0] })),
	);

describe("every waited model call is bounded (AC 44)", () => {
	it("finds the constructions at all", () => {
		expect(modelConstructions().length).toBeGreaterThanOrEqual(13);
	});

	it("declares timeout and maxRetries on every one", () => {
		const unbounded = modelConstructions()
			.filter(
				({ options }) =>
					!options.includes("timeout:") || !options.includes("maxRetries:"),
			)
			.map(({ file }) => file);

		expect([...new Set(unbounded)]).toEqual([]);
	});
});

describe("both graphs are bounded (AC 45)", () => {
	const SERVICES = [
		"server/services/courseAI/courseAI.service.ts",
		"server/services/learningPathAI/learningPathAI.service.ts",
	];

	it("declares an explicit recursionLimit", () => {
		for (const file of SERVICES) {
			expect(readFileSync(file, "utf-8")).toMatch(/recursionLimit:/);
		}
	});

	it("bounds each turn, not only each call", () => {
		for (const file of SERVICES) {
			expect(readFileSync(file, "utf-8")).toMatch(/withTurnDeadline\(/);
		}
	});

	it("combines the caller's signal with the deadline rather than replacing it", async () => {
		const { withTurnDeadline } = await import("./modelDefaults");
		const caller = new AbortController();

		const combined = withTurnDeadline(caller.signal);
		expect(combined.aborted).toBe(false);

		caller.abort();
		expect(combined.aborted).toBe(true);
	});

	it("still returns a live signal when the caller has none", async () => {
		const { withTurnDeadline } = await import("./modelDefaults");

		expect(withTurnDeadline().aborted).toBe(false);
	});
});
