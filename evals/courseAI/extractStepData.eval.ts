import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { extractStepData } from "@/server/services/courseAI/graph/nodes/extractStepData";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: {
		role: "user" | "assistant";
		content: string;
		step: keyof typeof DraftStep;
	}[];
	keyFields: Record<string, unknown>;
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/extractStepData.jsonl",
);

const keyFieldsMatch = (
	extracted: unknown,
	expected: Record<string, unknown>,
) => {
	const obj = extracted as Record<string, unknown>;
	if ("objectives" in expected) {
		const arr = obj.objectives as unknown[] | undefined;
		return Array.isArray(arr) && arr.length >= (expected.objectives as number);
	}
	if ("requirements" in expected) {
		const arr = obj.requirements as unknown[] | undefined;
		return (
			Array.isArray(arr) && arr.length >= (expected.requirements as number)
		);
	}
	if ("sectionsMin" in expected) {
		const arr = obj.sections as unknown[] | undefined;
		return Array.isArray(arr) && arr.length >= (expected.sectionsMin as number);
	}
	return Object.entries(expected).every(([k, v]) => {
		const actual = obj[k];
		return typeof actual === "string" && typeof v === "string"
			? actual.toLowerCase().includes(v.toLowerCase())
			: actual === v;
	});
};

export async function runExtractStepDataEval() {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const step = DraftStep[r.currentStep];
			const out = await extractStepData({
				generationId: "eval",
				instructorId: "eval",
				currentStep: step,
				content: {},
				history: r.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
				mode: "finalize",
				userMessage: "",
				intent: null,
				reviseTarget: null,
				toolCalls: [],
				pendingToolCalls: [],
				assessReady: false,
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
			});
			const schema = getValidatorForStep(step);
			const parsed = schema.safeParse(out.draftStepData);
			const ok =
				parsed.success && keyFieldsMatch(out.draftStepData, r.keyFields);
			return { id: r.id, ok, zodOk: parsed.success };
		}),
	);

	const pass = results.filter((r) => r.ok).length / results.length;
	console.log(`extractStepData pass rate: ${(pass * 100).toFixed(1)}%`);
	console.log(
		"Failures:",
		results.filter((r) => !r.ok).map((r) => r.id),
	);
	if (pass < 0.9) {
		console.error("FAIL: extractStepData below 0.9 threshold");
		process.exit(1);
	}
}