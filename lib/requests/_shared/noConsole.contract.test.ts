import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 8. Every RSC fetcher routes failure through safeRequest, so a failed
 * query is reported before the page falls back — these 34 files were the largest
 * silent hole in the application.
 */

const ROOT = "lib/requests";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

const fetchers = (): string[] =>
	walk(ROOT).filter((file) => !file.includes("_shared"));

describe("lib/requests reports its failures", () => {
	it("no fetcher calls console.*", () => {
		const offenders = fetchers().filter((file) => /console\./.test(code(file)));

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("every fetcher goes through safeRequest", () => {
		const offenders = fetchers().filter(
			(file) => !/safeRequest\(/.test(code(file)),
		);

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("every operation name is unique, so call sites do not fingerprint together", () => {
		// instructor/getDashboardStats and student/getDashboardStats share a function
		// name, which is why the op is qualified by directory rather than derived
		// from the function alone.
		const ops = fetchers().flatMap(
			(file) => code(file).match(/safeRequest\(\s*"([^"]+)"/)?.[1] ?? [],
		);

		expect(new Set(ops).size).toBe(ops.length);
	});

	it("finds the fetchers at all — the scan is not vacuous", () => {
		expect(fetchers().length).toBeGreaterThanOrEqual(34);
	});
});
