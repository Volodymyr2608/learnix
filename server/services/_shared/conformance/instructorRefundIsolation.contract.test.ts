import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * C19 / AC-C19 (W8): the instructor never learns of a refund request, an appeal, its evidence or a
 * student's reason. Every instructor-facing module is scanned for the names that would carry them;
 * the revenue responses themselves are pinned by `instructorHeld.integration.test.ts`.
 */
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
	});

const INSTRUCTOR_FACING = [
	"app/_components/Instructor",
	"app/instructor",
	"lib/requests/instructor",
	"server/entities/payment/revenue.ts",
	...readdirSync("app/_emails")
		.filter((name) => /instructor/i.test(name))
		.map((name) => join("app/_emails", name)),
].filter((path) => existsSync(path));

const files = INSTRUCTOR_FACING.flatMap((path) =>
	statSync(path).isDirectory() ? walk(path) : [path],
);

const REFUND_DATA =
	/refundRequest|refundAppeal|refundEvidence|refund_requests|refund_appeals|refund_evidence|denialReason|RefundReason|appealText/;

describe("instructor-facing code carries no refund request data (C19, AC-C19)", () => {
	it("scans the instructor surfaces", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it("references no refund request, appeal, evidence or reason", () => {
		const offenders = files.filter((f) =>
			REFUND_DATA.test(readFileSync(f, "utf-8")),
		);
		expect(offenders, offenders.join("\n")).toEqual([]);
	});
});
