import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AC-C14 / FR-P24 / C14: money leaves the platform through ONE function. Any second caller of
 * `transfers.create` — a "quick" payout at sale, an admin sweep, a script — would bypass the
 * release predicate and the hold. Tests and comments are excluded.
 */
const ROOTS = ["server", "app", "scripts", "lib"];
const SOURCE = /\.(ts|tsx|js|mjs)$/;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return SOURCE.test(full) && !/\.test\.(ts|tsx)$/.test(full) ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

/**
 * The nearest declaration above an index: a class method (`\tasync name(` / `\tprivate name(`,
 * one tab deep) or a top-level `const name =` / `function name(`. Line-based on purpose — a
 * call expression such as `stripe.accounts.retrieve(…)` is never a declaration.
 */
const DECLARATION =
	/^(?:\t(?:private\s+|public\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(|(?:export\s+)?(?:const|function)\s+([A-Za-z_$][\w$]*))/;

const enclosingFunction = (source: string, index: number): string => {
	const lines = source.slice(0, index).split("\n").reverse();
	for (const line of lines) {
		const match = DECLARATION.exec(line);
		if (match) return match[1] ?? match[2] ?? "<anonymous>";
	}
	return "<top level>";
};

describe("transfers.create has exactly one caller (AC-C14)", () => {
	it("is called only inside connectService.releasePayment", () => {
		const callers = ROOTS.flatMap((root) => walk(root)).flatMap((file) => {
			const source = code(file);
			return [...source.matchAll(/\.transfers\s*\.\s*create\s*\(/g)].map(
				(m) => `${file}:${enclosingFunction(source, m.index ?? 0)}`,
			);
		});

		expect(callers).toEqual([
			"server/services/payments/connect.service.ts:releasePayment",
		]);
	});
});
