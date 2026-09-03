import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 6 / AC 10. Two rules that must not decay, pinned mechanically
 * because both fail silently: a metric that starts carrying free text still
 * logs, and a metric promoted to `error` level still logs — the damage is
 * invisible at the call site and shows up as a leak or an exhausted Sentry
 * quota weeks later.
 *
 * AC 6 is asserted here against the TYPE rather than a driven payload, which
 * `emit.test.ts` already covers behaviourally: a field could be added to the
 * type and left unpopulated, passing the behavioural test while opening exactly
 * the hole this guards.
 */

const DIR = "server/services/_shared/aiMetrics";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

const sourceFiles = walk(DIR).filter((f) => !f.endsWith(".test.ts"));

describe("no metric can reach Sentry (AC 10)", () => {
	it("calls logger.error nowhere in the module", () => {
		// logger.ts routes error-level entries to reportError, and the free tier
		// is 5,000 events a month. One line per model call at that level exhausts
		// it during normal operation.
		const offenders = sourceFiles.filter((file) =>
			/logger\s*\.\s*error\s*\(/.test(code(file)),
		);

		expect(offenders).toEqual([]);
	});

	it("imports no Sentry SDK directly", () => {
		// server/observability/importBoundary.contract.test.ts owns this rule for
		// server/** as a whole; asserted here too because this module is the one
		// most tempted to reach for a second sink.
		const offenders = sourceFiles.filter((file) =>
			/@sentry\//.test(code(file)),
		);

		expect(offenders).toEqual([]);
	});
});

describe("the event type admits no free text (AC 6)", () => {
	const types = code(`${DIR}/types.ts`);

	/**
	 * Field names that would carry call content. Matched as declarations in the
	 * type file, so adding one fails here rather than at a code review.
	 */
	const FORBIDDEN = [
		"prompt",
		"prompts",
		"message",
		"messages",
		"content",
		"reply",
		"text",
		"input",
		"output",
		"args",
		"arguments",
		"result",
		"response",
	];

	it.each(FORBIDDEN)("declares no `%s` field", (field) => {
		expect(new RegExp(`^\\s*${field}\\??\\s*:`, "m").test(types)).toBe(false);
	});

	it("keeps errorName, which is a class rather than a message", () => {
		// The positive half: a scan that matched nothing would pass every
		// assertion above while proving the type file was empty.
		expect(/^\s*errorName\??\s*:/m.test(types)).toBe(true);
		expect(/^\s*errorMessage\??\s*:/m.test(types)).toBe(false);
	});
});
