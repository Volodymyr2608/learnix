import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	containsHandWrittenPrompt,
	HAND_WRITTEN_BY_DESIGN,
} from "./promptFidelity";

const EVALS_DIR = "evals";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".eval.ts") ? [full] : [];
	});

const allowed = new Set(HAND_WRITTEN_BY_DESIGN.map((e) => e.file));

describe("the detector catches a hand-written prompt however it is spelled", () => {
	/**
	 * Each of these re-introduces the defect a different way. A rule shaped
	 * around the declaration (`const *SYSTEM_PROMPT =`) catches only the first
	 * and waves the rest through — including the inline form, which is the most
	 * natural way to write it a second time.
	 */
	it.each([
		["the original form", "const SYSTEM_PROMPT = `You are an AI tutor...`;"],
		["a suffixed name", "const SYSTEM_PROMPT_V2 = `You are an AI tutor...`;"],
		["a different name", "const TUTOR_PROMPT = `You are an AI tutor...`;"],
		["a lowercase local", 'const systemPrompt = "You are an AI tutor...";'],
		[
			"inlined at the call site",
			"createAgent({ systemPrompt: `You are...` });",
		],
		["let instead of const", "let SYSTEM_PROMPT = `You are an AI tutor...`;"],
	])("catches %s", (_label, source) => {
		expect(containsHandWrittenPrompt(source)).toBe(true);
	});

	it.each([
		[
			"an imported prompt",
			'import { SYSTEM_PROMPT } from "@/server/services/lessonAI/lessonAI.agent";',
		],
		[
			"a formatted imported prompt",
			"const systemPrompt = await template.format({ count, level });",
		],
		[
			"an interpolated imported prompt",
			'systemPrompt: SYSTEM_PROMPT.replace("{x}", () => y),',
		],
		[
			"a prompt quoted in a comment",
			'// the shipped prompt opens "You are an AI tutor for one lesson"',
		],
	])("does not flag %s", (_label, source) => {
		expect(containsHandWrittenPrompt(source)).toBe(false);
	});
});

describe("every eval runs the prompt production runs", () => {
	const files = walk(EVALS_DIR);

	it("finds eval files to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)("%s", (file) => {
		if (allowed.has(file)) return;
		expect(containsHandWrittenPrompt(readFileSync(file, "utf-8"))).toBe(false);
	});
});

describe("the exception list stays honest", () => {
	it.each(HAND_WRITTEN_BY_DESIGN)("$file still has a hand-written prompt", ({
		file,
	}) => {
		expect(containsHandWrittenPrompt(readFileSync(file, "utf-8"))).toBe(true);
	});

	it.each(HAND_WRITTEN_BY_DESIGN)("$file gives a reason", ({ reason }) => {
		expect(reason.length).toBeGreaterThan(40);
	});
});
