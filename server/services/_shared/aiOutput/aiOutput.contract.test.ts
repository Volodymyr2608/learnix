import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = "server/services/_shared/aiOutput";

/** Callers permitted to enforce here and report somewhere else. */
const ALLOWED_SILENT_CALLERS = [
	"server/services/lessonAI/validateReply.ts",
	"server/services/courseAI/graph/nodes/outputBoundary.ts",
];

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") ? [full] : [];
	});

const moduleFiles = (): string[] =>
	walk(DIR).filter((f) => !f.endsWith(".test.ts"));

/** Every file the barrel pulls in, transitively, following relative imports. */
const reachableFromBarrel = (): string[] => {
	const seen = new Set<string>();
	const queue = [`${DIR}/index.ts`];

	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file)) continue;
		seen.add(file);

		const source = readFileSync(file, "utf-8");
		for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
			const specifier = match[1] ?? "";
			const resolved = join(DIR, `${specifier.replace(/^\.\//, "")}.ts`);
			if (!seen.has(resolved)) queue.push(resolved);
		}
	}

	return [...seen];
};

describe("aiOutput module boundaries", () => {
	it("does not export the raw check functions — wildcard or named (AC 4)", () => {
		const barrel = readFileSync(`${DIR}/index.ts`, "utf-8");

		expect(barrel).not.toMatch(/export\s*\*\s*from\s*"\.\/checks"/);
		expect(barrel).not.toMatch(/export\s*\{[^}]*\}\s*from\s*"\.\/checks"/);
		expect(barrel).not.toMatch(
			/containsSystemPromptLeak|containsUntrustedDataEcho|containsOffOriginLink/,
		);
	});

	it("imports nothing from lessonAI (AC 7)", () => {
		// Scoped to what the boundary actually loads: every file reachable from the
		// barrel. `promptVariants.ts` sits in the same folder and imports all five
		// surfaces by design — it is the marker-pinning registry, not part of the
		// boundary — and the next test proves it is outside this graph rather than
		// asserting it by hand.
		const offenders = reachableFromBarrel().filter((file) =>
			/from\s+["'][^"']*lessonAI/.test(readFileSync(file, "utf-8")),
		);

		expect(offenders).toEqual([]);
	});

	it("does not load the prompt-variant registry at runtime", () => {
		expect(reachableFromBarrel()).not.toContain(`${DIR}/promptVariants.ts`);
		expect(moduleFiles()).toContain(`${DIR}/promptVariants.ts`);
	});

	it("asks lib/url for the origin decision rather than answering it twice", () => {
		const checks = readFileSync(`${DIR}/checks.ts`, "utf-8");

		expect(checks).toContain('from "@/lib/url"');
		expect(checks).not.toMatch(/const\s+isOffOrigin\s*=/);
	});

	it("lets only the permitted callers silence emission", () => {
		// Comments are stripped: the module that defines the affordance documents
		// it, and its own JSDoc must not read as a use of it.
		const code = (file: string): string =>
			readFileSync(file, "utf-8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/\/\/.*$/gm, "");

		const unpermitted = walk("server")
			.filter((f) => !f.endsWith(".test.ts"))
			.filter((f) => /emit:\s*false/.test(code(f)))
			.filter((f) => !ALLOWED_SILENT_CALLERS.includes(f));

		expect(unpermitted).toEqual([]);
	});
});
