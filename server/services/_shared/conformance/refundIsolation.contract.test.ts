import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUARDED_ENTRY_POINTS } from "@/server/services/_shared/aiGuard/entryPoints";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

const REFUND =
	/refundRequest|refund\.service|refundEffects|refundRequest\.repository|payout/i;
const OPENED = /openedLesson|opened_lessons/;

const aiEntryPoints = (): string[] => [
	...GUARDED_ENTRY_POINTS,
	...walk("server/services/lessonAI"),
	...walk("server/services/courseAI"),
	...walk("server/services/learningPathAI"),
	...walk("server/services/lessonInsightsAI"),
	...walk("server/services/quizAI"),
	"app/api/chat/lesson/route.ts",
	"app/api/chat/course/route.ts",
	"app/api/chat/learning-path/route.ts",
];

describe("refund state stays out of AI (AC-L9, AC-L10)", () => {
	it("no AI entry point imports refund or payout code, or reads refund models (AI-L9)", () => {
		const leaking = [...new Set(aiEntryPoints())].filter((file) =>
			REFUND.test(code(file)),
		);

		expect(leaking, leaking.join("\n")).toEqual([]);
	});

	it("no tutor tool reaches opened-lesson or refund state (AI-L10)", () => {
		const tools = walk("server/services/lessonAI/tools");
		const leaking = tools.filter((file) => {
			const source = code(file);
			return OPENED.test(source) || REFUND.test(source);
		});

		expect(tools.length).toBeGreaterThanOrEqual(4);
		expect(leaking, leaking.join("\n")).toEqual([]);
	});
});
