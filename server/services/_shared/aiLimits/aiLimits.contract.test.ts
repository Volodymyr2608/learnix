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

		for (const file of walk("server/api/routers")) {
			if (file.endsWith(".test.ts")) continue;
			for (const match of code(file).matchAll(
				/(\w+)\s*\n?\s*\.use\(aiRateLimit\(/g,
			)) {
				const builder = match[1] as string;
				if (!new RegExp(`^${ROLE_PROCEDURES}$`).test(builder)) {
					offenders.push(`${file}: ${builder}.use(aiRateLimit(…))`);
				}
			}
		}

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("finds the call sites at all — the scan is not vacuous", () => {
		const sites = walk("server/api/routers")
			.filter((f) => !f.endsWith(".test.ts"))
			.flatMap((file) => [...code(file).matchAll(/\.use\(aiRateLimit\(/g)]);

		expect(sites.length).toBeGreaterThanOrEqual(3);
	});
});
