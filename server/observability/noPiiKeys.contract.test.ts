import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 17: No logger.error, logger.warn, logger.info, or logger.debug
 * call in server/** passes an object literal containing keys named `email`,
 * `toEmail`, `fromEmail`, or `replyTo`. These are personally identifiable
 * information (PII) and must never be logged.
 *
 * Rationale: Even after redaction and fingerprinting, logging PII directly
 * violates privacy principles and regulatory requirements (GDPR, CCPA, etc).
 * User IDs and other non-PII domain context are preferred for correlation.
 */

const ROOTS = ["server"];

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

const scanTargets = (): string[] =>
	ROOTS.filter((root) => existsSync(root))
		.flatMap((root) => walk(root))
		.filter((f) => !f.endsWith(".test.ts"));

describe("no logger.* calls pass PII keys (AC 17)", () => {
	it("no logger.error/warn/info/debug call contains email, toEmail, fromEmail, or replyTo keys", () => {
		// Pattern explanation:
		// - Match logger.(error|warn|info|debug) calls
		// - Within that call, look for the forbidden keys as object literal keys
		// - Keys appear before a colon in object literals: `{ toEmail: value }`
		const piiKeyPattern =
			/logger\.(error|warn|info|debug)\s*\([^)]*\b(email|toEmail|fromEmail|replyTo)\s*:/;

		const offenders = scanTargets().filter((f) => piiKeyPattern.test(code(f)));

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds files at all — the scan is not vacuous", () => {
		expect(scanTargets().length).toBeGreaterThan(0);
	});

	it("the scan actually encounters logger calls across the codebase", () => {
		const loggerPattern = /logger\.(error|warn|info|debug)\s*\(/;
		const filesWithLoggers = scanTargets().filter((f) =>
			loggerPattern.test(code(f)),
		);

		expect(filesWithLoggers.length).toBeGreaterThan(0);
	});
});
