import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROLE_PROCEDURES = "(instructorProcedure|studentProcedure|adminProcedure)";
const DIR = "server/services/_shared/aiLimits";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") ? [full] : [];
	});

/**
 * The procedure a `.use(aiRateLimit(` site is chained onto, found by walking
 * LEFT over balanced calls: `publicProcedure.input(Dto).use(aiRateLimit(…))`
 * must attribute to `publicProcedure`, not to whatever token happens to sit
 * next to `.use`. Scanned rather than matched, because the regex form of this
 * needs nested quantifiers and backtracks catastrophically on a real router.
 *
 * Returns null when the head cannot be identified — an unattributable site is
 * an offender, since silence is how a publicProcedure call site slips through.
 */
const procedureHead = (source: string, useIndex: number): string | null => {
	let i = useIndex - 1;

	for (let guard = 0; guard < 200; guard++) {
		while (i >= 0 && /\s/.test(source[i] as string)) i--;
		if (i < 0) return null;

		if (source[i] === ")") {
			let depth = 0;
			while (i >= 0) {
				if (source[i] === ")") depth++;
				else if (source[i] === "(") {
					depth--;
					if (depth === 0) break;
				}
				i--;
			}
			if (i < 0) return null;
			i--; // step past "("
			while (i >= 0 && /[\w$]/.test(source[i] as string)) i--; // the method name
			while (i >= 0 && /\s/.test(source[i] as string)) i--;
			if (source[i] !== ".") return null;
			i--; // step past "."
			continue;
		}

		if (/[\w$]/.test(source[i] as string)) {
			const end = i + 1;
			while (i >= 0 && /[\w$]/.test(source[i] as string)) i--;
			return source.slice(i + 1, end);
		}

		return null;
	}

	return null;
};

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

describe("aiLimits exports no way to lose a role check (AC 35)", () => {
	it("exports a middleware, never a procedure builder", () => {
		const offenders = walk(DIR)
			.filter((f) => !f.endsWith(".test.ts"))
			.filter((file) =>
				/export const \w*[Pp]rocedure|t\.procedure|protectedProcedure\s*\.use/.test(
					code(file),
				),
			);

		expect(offenders).toEqual([]);
	});

	it("server/api/trpc.ts exports the middleware factory, not `t`", () => {
		const source = code("server/api/trpc.ts");

		expect(source).toMatch(
			/export const createTRPCMiddleware = t\.middleware;/,
		);
		expect(source).not.toMatch(/^export (const|\{)[^\n]*\bt\b\s*[,;=}]/m);
	});

	/**
	 * The COMPLETENESS half, and the reason AC 35 is worded around a scan rather
	 * than the type system: `t.middleware` types its callback against the root
	 * context, so contravariance happily allows
	 * `publicProcedure.use(aiRateLimit("newAI"))`. tsc cannot object. This sees
	 * every call site that exists, not a list of the ones known when it was
	 * written.
	 */
	it("every .use(aiRateLimit( in the router tree sits on a role procedure", () => {
		const offenders: string[] = [];

		for (const file of walk("server/api")) {
			if (file.endsWith(".test.ts")) continue;
			const source = code(file);

			for (const match of source.matchAll(/\.use\(aiRateLimit\(/g)) {
				const builder = procedureHead(source, match.index as number);
				if (builder === null) {
					offenders.push(`${file}: unattributable .use(aiRateLimit(…)) site`);
					continue;
				}
				if (!new RegExp(`^${ROLE_PROCEDURES}$`).test(builder)) {
					offenders.push(`${file}: ${builder}.use(aiRateLimit(…))`);
				}
			}
		}

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds the call sites at all — the scan is not vacuous", () => {
		const sites = walk("server/api")
			.filter((f) => !f.endsWith(".test.ts"))
			.flatMap((file) => [...code(file).matchAll(/\.use\(aiRateLimit\(/g)]);

		expect(sites.length).toBeGreaterThanOrEqual(3);
	});
});

/**
 * `checkAiRateLimit` returns a Promise since the counters moved to a shared
 * store. A Promise is ALWAYS truthy, so a call site that drops the `await`
 * reads `if (!promise)` — permanently false — and the surface silently stops
 * being rate limited.
 *
 * Neither gate catches it: tsc accepts `!somePromise`, and Biome's formatter
 * and linter have nothing to say about it either (verified by removing an
 * `await` and running both). The failure is invisible in tests too, because
 * `await` over a non-Promise is a no-op, so the same test passes against the
 * sync and async versions alike.
 *
 * That leaves the source text, which is the same reason AC 35 above is a scan.
 */
describe("every checkAiRateLimit call site awaits its result", () => {
	const CALLERS = ["server", "app"];
	const OWN_MODULE = "server/services/_shared/aiLimits/checkAiRateLimit.ts";

	const callSites = () =>
		CALLERS.flatMap((root) => walk(root))
			.filter((f) => !f.endsWith(".test.ts") && f !== OWN_MODULE)
			.flatMap((file) => {
				const source = code(file);
				return [...source.matchAll(/checkAiRateLimit\s*\(/g)].map((match) => ({
					file,
					before: source.slice(
						Math.max(0, (match.index as number) - 8),
						match.index as number,
					),
				}));
			});

	it("has no unawaited call", () => {
		const offenders = callSites()
			.filter(({ before }) => !/\bawait\s+$/.test(before))
			.map(({ file }) => `${file}: checkAiRateLimit(…) without await`);

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds the call sites at all — the scan is not vacuous", () => {
		// Three raw routes, the tRPC middleware, and learningPathAI's scoped window.
		expect(callSites().length).toBeGreaterThanOrEqual(5);
	});
});
