import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AC-C22 (student half): the refund page shows the student's own reason text, which is stored as
 * typed. Under `app/_components/Billing/` nothing renders raw HTML, so `<img src=x onerror=…>`
 * can only ever appear as text.
 */
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
	});

describe("Billing renders no raw HTML (AC-C22)", () => {
	const files = walk("app/_components/Billing");

	it("scans the refund components", () => {
		expect(files.some((f) => f.includes("RefundPage"))).toBe(true);
	});

	it("never uses dangerouslySetInnerHTML", () => {
		const offenders = files.filter((f) =>
			readFileSync(f, "utf-8").includes("dangerouslySetInnerHTML"),
		);
		expect(offenders).toEqual([]);
	});
});
