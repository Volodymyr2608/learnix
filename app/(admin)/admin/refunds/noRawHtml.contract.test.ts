import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** AC-C22 (admin half): appeal reasons, texts and file names render as text on the admin page. */
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
	});

describe("the admin refunds page renders no raw HTML (AC-C22)", () => {
	const files = walk("app/(admin)/admin/refunds");

	it("scans the page and its components", () => {
		expect(files.some((f) => f.includes("AppealCard"))).toBe(true);
	});

	it("never uses dangerouslySetInnerHTML", () => {
		expect(
			files.filter((f) =>
				readFileSync(f, "utf-8").includes("dangerouslySetInnerHTML"),
			),
		).toEqual([]);
	});
});
