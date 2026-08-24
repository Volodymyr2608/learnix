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

/**
 * The directory walk above covers no repo-root file, and three of the four files that
 * may touch the SDK live there. Mirrors `buildConfig.contract.test.ts`'s ROOT_FILES for
 * the same reason: without it, a root-level module importing the capture API at runtime
 * passes this scan silently, and `next.config.ts` is not accounted for at all.
 */
const ROOT_FILES = [
	"next.config.ts",
	"instrumentation.ts",
	"sentry.server.config.ts",
];

/**
 * Two runtime owners: the funnel itself, and the init call that configures it.
 * `instrumentation.ts` is deliberately NOT one — its `onRequestError` used to re-export
 * `Sentry.captureRequestError`, which captured the raw error, and now calls
 * `reportError` like every other capture point.
 */
const RUNTIME_OWNERS = [
	"sentry.server.config.ts",
	"server/observability/reportError.ts",
];

/**
 * `next.config.ts` imports `withSentryConfig` — build-time bundler configuration, not a
 * capture API, and it never runs in a request. A different kind of exception from the
 * runtime owners, so it is listed apart from them rather than folded in.
 */
const BUILD_OWNERS = ["next.config.ts"];

const OWNERS = [...RUNTIME_OWNERS, ...BUILD_OWNERS];

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
	[
		...ROOTS.filter((root) => existsSync(root)).flatMap((root) => walk(root)),
		...ROOT_FILES.filter((f) => existsSync(f)),
	].filter((f) => !f.endsWith(".test.ts") && !OWNERS.includes(f));

describe("only the owner files import the Sentry SDK (AC 10/11)", () => {
	it("no non-owner imports the Sentry SDK", () => {
		const offenders = scanTargets().filter((f) =>
			/from\s+["']@sentry\/nextjs["']/.test(code(f)),
		);

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds the owners at all — the scan is not vacuous", () => {
		expect(OWNERS.filter((f) => /@sentry\/nextjs/.test(code(f)))).toEqual(
			OWNERS,
		);
	});

	it("walks repo-root files, so a root-level importer cannot slip past", () => {
		// instrumentation.ts is the proof: it is a root file, it is not an owner, and
		// it is exactly where an SDK import would most plausibly reappear.
		expect(scanTargets()).toContain("instrumentation.ts");
	});

	it("instrumentation.ts no longer imports the SDK — it goes through reportError", () => {
		expect(code("instrumentation.ts")).not.toMatch(/@sentry\/nextjs/);
		expect(code("instrumentation.ts")).toMatch(/reportError/);
	});
});
