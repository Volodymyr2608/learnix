import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "app/api/chat";
const READS_BODY = /req\.json\(\)/;
const VALIDATES = /safeParse\(|\.parse\(/;

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
 * absent one.
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