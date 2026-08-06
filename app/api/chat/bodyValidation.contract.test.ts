import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "app/api/chat";
// Any parameter name, not just `req` — `request.json()` is equally idiomatic.
const READS_BODY = /\.json\(\)/;
// A *Schema* must be what does the parsing. A bare /\.parse\(/ is satisfied by
// an unrelated `JSON.parse(` elsewhere in the file, which is a demonstrated
// bypass, not a hypothetical one.
const VALIDATES = /\w*Schema\.(safeParse|parse)\(/;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

/**
 * These routes are the only place a request body reaches Prisma without passing
 * through a tRPC procedure's schema. Prisma accepts a filter object wherever a
 * String id is expected, so an unvalidated id can act as a query rather than a
 * value — see docs/specs/features/ai-chat-route-authorization/spec.md.
 *
 * Like entryPoints.contract.test.ts, this catches the omission, not the logic:
 * it cannot tell a correct schema from a sloppy one, only a present one from an
 * absent one. It also cannot prove the schema was applied to the body rather
 * than to something else in the same file — requiring the parse to happen on a
 * `*Schema` const is as far as source-text matching gets without an AST.
 */
describe("chat route body validation coverage", () => {
	it("every chat route that reads a body validates it with a schema", () => {
		const unvalidated = walk(join(process.cwd(), ROOT))
			.map((abs) => abs.slice(process.cwd().length + 1))
			.filter((rel) => {
				const source = readFileSync(rel, "utf-8");
				return READS_BODY.test(source) && !VALIDATES.test(source);
			});

		expect(unvalidated).toEqual([]);
	});
});
