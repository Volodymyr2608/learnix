import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec.md AC 29, 33, 34, 35 — the build-time Sentry wiring pinned in `next.config.ts`.
 * Each assertion here mirrors the rationale written directly above
 * `withSentryConfig(...)` in that file; read it alongside this scan.
 */

const ROOTS = ["server", "app", "lib", "trpc", "scripts"];
const ROOT_FILES = [
	"next.config.ts",
	"instrumentation.ts",
	"sentry.server.config.ts",
];
const THIS_FILE = "server/observability/buildConfig.contract.test.ts";

/**
 * `scripts/check-build-artifacts.ts` is the AC 29 post-build scan itself — it greps
 * `.next/` for the literal identifier and, when available, the real secret value, so
 * it necessarily reads `process.env.SENTRY_AUTH_TOKEN` and names the string it is
 * looking for. It is a build/CI tool that never ships in the app bundle and is never
 * imported by application code, so it is a documented exception, not a hole in this
 * scan — verified below rather than just asserted.
 */
const EXEMPT = ["scripts/check-build-artifacts.ts"];

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") || full.endsWith(".tsx") || full.endsWith(".js")
			? [full]
			: [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

const allSourceFiles = (): string[] => [
	...ROOTS.filter((root) => existsSync(root)).flatMap((root) => walk(root)),
	...ROOT_FILES.filter((f) => existsSync(f)),
];

describe("AC 29: SENTRY_AUTH_TOKEN is read only in next.config.ts", () => {
	it("no source file other than next.config.ts references SENTRY_AUTH_TOKEN", () => {
		const offenders = allSourceFiles()
			.filter((f) => f !== "next.config.ts")
			.filter(
				(f) =>
					!f.endsWith(".test.ts") && f !== THIS_FILE && !EXEMPT.includes(f),
			)
			.filter((f) => /SENTRY_AUTH_TOKEN/.test(code(f)));

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("next.config.ts does reference SENTRY_AUTH_TOKEN — the scan is not vacuous", () => {
		expect(/SENTRY_AUTH_TOKEN/.test(code("next.config.ts"))).toBe(true);
	});

	it("the exemption is a documented exception, not a hole in the walk", () => {
		expect(existsSync(EXEMPT[0] as string)).toBe(true);
		expect(allSourceFiles().includes(EXEMPT[0] as string)).toBe(true);
	});
});

describe("AC 33: no manual span/transaction call can consume the zero trace budget", () => {
	const SPAN_ROOTS = ["server", "app", "lib", "trpc"];

	const spanScanTargets = (): string[] =>
		SPAN_ROOTS.filter((root) => existsSync(root))
			.flatMap((root) => walk(root))
			.filter((f) => !f.endsWith(".test.ts"));

	it("no Sentry.startSpan or Sentry.startTransaction call exists", () => {
		const offenders = spanScanTargets().filter((f) =>
			/Sentry\.(startSpan|startTransaction)\s*\(/.test(code(f)),
		);

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds files at all — the scan is not vacuous", () => {
		expect(spanScanTargets().length).toBeGreaterThan(0);
	});
});

describe("AC 34: tunnelRoute is not enabled", () => {
	it("next.config.ts does not contain the string 'tunnelRoute'", () => {
		expect(code("next.config.ts")).not.toMatch(/tunnelRoute/);
	});
});

describe("AC 35: source maps are deleted after upload and server chunks are not widened", () => {
	it("next.config.ts pins deleteSourcemapsAfterUpload: true", () => {
		expect(readFileSync("next.config.ts", "utf-8")).toContain(
			"deleteSourcemapsAfterUpload: true",
		);
	});

	it("next.config.ts pins widenClientFileUpload: false", () => {
		expect(readFileSync("next.config.ts", "utf-8")).toContain(
			"widenClientFileUpload: false",
		);
	});
});
