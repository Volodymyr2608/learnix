import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXEMPT_MODEL_CALLERS, GUARDED_ENTRY_POINTS } from "./entryPoints";

const ROOTS = ["server/services", "app/api/chat"];
const MODEL_CALL = /new ChatOpenAI\(|createAgent\(/;

const walk = (dir: string): string[] => {
	const entries = readdirSync(dir);
	return entries.flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});
};

describe("aiGuard entry-point coverage (AC-10)", () => {
	it("every file that calls a model is guarded, wrapped, or explicitly exempt", () => {
		const modelCallers = ROOTS.flatMap((root) =>
			walk(join(process.cwd(), root)),
		)
			.map((abs) => abs.slice(process.cwd().length + 1))
			.filter((rel) => MODEL_CALL.test(readFileSync(rel, "utf-8")));

		const unaccounted = modelCallers.filter(
			(file) =>
				!GUARDED_ENTRY_POINTS.includes(file) &&
				!EXEMPT_MODEL_CALLERS.includes(file),
		);

		expect(unaccounted).toEqual([]);
	});

	it("every registered entry point actually calls the guard it claims", () => {
		const missing = GUARDED_ENTRY_POINTS.filter((file) => {
			const source = readFileSync(file, "utf-8");
			return (
				!source.includes("guardUserInput") &&
				!source.includes("wrapUntrustedContent")
			);
		});

		expect(missing).toEqual([]);
	});
});
