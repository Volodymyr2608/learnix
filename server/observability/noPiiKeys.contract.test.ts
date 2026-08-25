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

/**
 * Extract the full balanced-parenthesis argument list from a logger call.
 * Given text like `logger.error("msg (note)", { toEmail: x })` at position of the opening `(`,
 * walk characters from that position, tracking depth, until we reach the matching closing `)`.
 * This handles strings, nested parens, and parenthetical asides in message arguments.
 */
const extractLoggerCallArgs = (
	text: string,
	startPos: number,
): string | null => {
	if (startPos >= text.length || text[startPos] !== "(") return null;

	let depth = 0;
	let inString = false;
	let stringChar = "";
	let escaped = false;

	for (let i = startPos; i < text.length; i++) {
		const char = text[i];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === "\\" && inString) {
			escaped = true;
			continue;
		}

		if ((char === '"' || char === "'" || char === "`") && !inString) {
			inString = true;
			stringChar = char;
			continue;
		}

		if (char === stringChar && inString) {
			inString = false;
			stringChar = "";
			continue;
		}

		if (inString) continue;

		if (char === "(") {
			depth++;
		} else if (char === ")") {
			depth--;
			if (depth === 0) {
				// Found the matching closing paren
				return text.substring(startPos, i + 1);
			}
		}
	}

	return null;
};

const hasForbiddenPiiKey = (
	fileContent: string,
	loggerCallPattern: RegExp,
	forbiddenKeyPattern: RegExp,
): boolean => {
	let match: RegExpExecArray | null = null;

	// Biome: need to avoid assignment in while, so we use a different approach
	loggerCallPattern.lastIndex = 0; // Reset regex state
	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec pattern requires assignment
	while ((match = loggerCallPattern.exec(fileContent)) !== null) {
		const args = extractLoggerCallArgs(
			fileContent,
			match.index + match[0].length - 1,
		);
		if (args && forbiddenKeyPattern.test(args)) {
			return true;
		}
	}

	return false;
};

describe("no logger.* calls pass PII keys (AC 17)", () => {
	it("no logger.error/warn/info/debug call contains email, toEmail, fromEmail, or replyTo keys", () => {
		// Pattern explanation:
		// - Match logger.(error|warn|info|debug) calls
		// - Extract the full balanced-parenthesis argument list (handles parens in string arguments)
		// - Check extracted content for forbidden keys as object literal keys
		// - Keys appear before a colon in object literals: `{ toEmail: value }`
		const loggerCallPattern = /logger\.(error|warn|info|debug)\s*\(/g;
		const forbiddenKeyPattern = /\b(email|toEmail|fromEmail|replyTo)\s*:/;

		const offenders = scanTargets().filter((f) =>
			hasForbiddenPiiKey(code(f), loggerCallPattern, forbiddenKeyPattern),
		);

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

	it("correctly detects forbidden keys even when message contains closing paren", () => {
		// Regression test: ensure paren-aware extraction catches violations
		// that would slip through a naive [^)]* pattern.
		// Example: logger.error("failed (retry 3)", { toEmail: x })
		//          The [^)]* would stop at the first ), missing { toEmail: x }
		const testCode =
			'logger.error("failed (retry 3)", { toEmail: "user@example.com" })';
		const loggerCallPattern = /logger\.(error|warn|info|debug)\s*\(/g;
		const forbiddenKeyPattern = /\b(email|toEmail|fromEmail|replyTo)\s*:/;

		const found = hasForbiddenPiiKey(
			testCode,
			loggerCallPattern,
			forbiddenKeyPattern,
		);

		expect(
			found,
			"should detect toEmail key in call with parenthetical message",
		).toBe(true);
	});
});
