import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * evals/aiOutput/{falsePositive,leakRecall}.eval.ts import the real
 * SYSTEM_PROMPT from server/services/** — evals/lessonAI/tutor.eval.ts and
 * evals/quizAI/quizGeneration.eval.ts used to hand-write their own instead.
 * The tutor copy directly contradicted the shipped prompt's tool-selection
 * rule (call retrieve_lesson_context for WHERE-questions, which the real
 * prompt forbids) and omitted UNTRUSTED_DATA_CLAUSE entirely — a green
 * `lessonAI:tutor` proved nothing about the agent actually shipped.
 *
 * A copy drifts silently the next time the real prompt changes; an import
 * cannot. This test pins the fix so the class cannot come back one eval at
 * a time.
 */

const EVALS_DIR = "evals";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".eval.ts") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

/**
 * A top-level `const ...SYSTEM_PROMPT = ...` is the eval writing its own
 * prompt. Importing one (`import { SYSTEM_PROMPT } from "@/server/..."`)
 * never matches this — imports don't start with `const`.
 */
const OWN_PROMPT_DECLARATION =
	/^\s*(?:export\s+)?const\s+\w*SYSTEM_PROMPT\b\s*=/m;

describe("eval fidelity: no eval declares its own system prompt", () => {
	const files = walk(EVALS_DIR);

	it("finds at least one eval file to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)("%s imports its system prompt, never declares one", (file) => {
		expect(OWN_PROMPT_DECLARATION.test(code(file))).toBe(false);
	});
});
