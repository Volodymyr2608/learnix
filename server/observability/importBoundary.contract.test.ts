import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 10/11. The projection at `server/observability/reportError.ts` is the
 * enforcement point: it strips model output down to a title-safe shape before handing
 * anything to Sentry. A module that imports the SDK directly can call
 * `captureException(realError)` and put `OutputParserException.message` — the entire
 * model output — into the Sentry issue title, bypassing the projection, the AC 2 dedup
 * marker and the AC 41 abort filter. So the boundary is scanned, not trusted.
 */
const ROOTS = ["server", "app", "lib", "trpc", "scripts"];

const OWNERS = [
	"sentry.server.config.ts",
	"instrumentation.ts",
	"server/observability/reportError.ts",
];

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
		.filter((f) => !f.endsWith(".test.ts") && !OWNERS.includes(f));

describe("only the three owner files import the Sentry SDK (AC 10/11)", () => {
	it("only the three owner files import the Sentry SDK", () => {
		const offenders = scanTargets().filter((f) =>
			/from\s+["']@sentry\/nextjs["']/.test(code(f)),
		);

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds the owners at all — the scan is not vacuous", () => {
		expect(OWNERS.filter((f) => /@sentry\/nextjs/.test(code(f))).length).toBe(
			3,
		);
	});
});
