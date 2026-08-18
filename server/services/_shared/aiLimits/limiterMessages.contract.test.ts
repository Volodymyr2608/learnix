import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A limiter message that names the window, the remaining count or the reset
 * time tells a caller how to pace themselves around it. The rejection is
 * allowed to say "not now"; it is not allowed to say "in 43 seconds" (AC 47).
 */
const ROOTS = ["app/api/chat", "server/services"];

const LEAKY =
	/\b(\d+\s*(seconds?|minutes?|hours?|requests?|per)|remaining|reset(s|ting)?\s+(at|in)|once per|try again in)\b/i;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

/** Every string literal on a line that rejects for rate-limiting reasons. */
const limiterMessages = (): Array<{ file: string; line: string }> =>
	ROOTS.flatMap(walk).flatMap((file) => {
		const source = readFileSync(file, "utf-8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "");

		if (!/checkAiRateLimit|RateLimited/.test(source)) return [];

		return source
			.split("\n")
			.filter((line) => /"[^"]{4,}"/.test(line))
			.filter((line) =>
				/Too Many Requests|TOO_MANY_REQUESTS|wait|rate|limit/i.test(line),
			)
			.map((line) => ({ file, line: line.trim() }));
	});

describe("limiter messages (AC 47)", () => {
	it("finds the rejection sites at all", () => {
		// Guards the scan itself: a rename that makes `limiterMessages` return
		// nothing would turn the assertion below into a vacuous pass.
		expect(limiterMessages().length).toBeGreaterThanOrEqual(3);
	});

	it("names no window, remaining count or reset time", () => {
		const leaky = limiterMessages()
			.filter(({ line }) => LEAKY.test(line))
			.map(({ file, line }) => `${file} — ${line}`);

		expect(leaky).toEqual([]);
	});
});
