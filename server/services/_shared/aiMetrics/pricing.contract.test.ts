import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 1. The price table has one home, and this is what keeps it there.
 *
 * The table already lived in two places conceptually — the eval runner priced a
 * suite run, and production was about to price a turn — and the failure mode of
 * two tables is not a crash: it is the eval's answer and the server's answer
 * quietly disagreeing after someone corrects a price in one of them. Neither
 * looks wrong on its own, which is exactly the class of drift a human review
 * does not catch and `docFigures.ts` was written for on the prose side.
 *
 * Scanned rather than trusted, and scanned over the source text with comments
 * stripped — the `aiLimits.contract.test.ts:63` idiom — so a price quoted in a
 * comment (this file has one, and so does pricing.ts) is not an offender.
 */

const OWNER = "server/services/_shared/aiMetrics/pricing.ts";
const ROOTS = ["server", "evals", "lib", "scripts", "app", "trpc"];

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

/**
 * A per-model price literal: an object with both an `input` and an `output`
 * numeric field, which is the shape a token price takes. Matching the shape
 * rather than the word "price" is deliberate — renaming the constant is the
 * first thing someone re-adding a table would do.
 */
const PRICE_LITERAL = /\{\s*input:\s*[\d.]+\s*,\s*output:\s*[\d.]+\s*\}/;

describe("the price table has exactly one home (AC 1)", () => {
	const offenders = ROOTS.flatMap(walk)
		.filter((file) => !file.endsWith(OWNER.split("/").pop() as string))
		.filter((file) => PRICE_LITERAL.test(code(file)));

	it("declares no per-model price literal outside pricing.ts", () => {
		expect(offenders).toEqual([]);
	});

	it("still finds the literal in the owner, so the scan itself is not vacuous", () => {
		// A scan that matches nothing anywhere would pass the assertion above
		// while proving nothing at all.
		expect(PRICE_LITERAL.test(code(OWNER))).toBe(true);
	});
});
