import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PathState } from "@/server/services/learningPathAI/learningPathAI.state";
import { reflectAndCheck } from "@/server/services/learningPathAI/nodes/reflectAndCheck.node";
import { accuracyGate } from "../_shared/score";

type RowState = Pick<
	PathState,
	"completedLessonIds" | "weakConcepts" | "finalSteps" | "summary"
>;

type Row = {
	id: string;
	state: RowState;
	expected: { ok: boolean };
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/learningPathAI/learningPath.jsonl",
);

const EMPTY_STATE: PathState = {
	studentId: "eval",
	courseId: "eval",
	skipLLM: false,
	completedLessonIds: [],
	lessonOrder: [],
	quizAttempts: [],
	mastery: [],
	weakConcepts: [],
	failedQuizzes: [],
	candidateSteps: [],
	finalSteps: [],
	generatedWeakConcepts: [],
	summary: "",
	reflectionAttempt: 0,
	reflectionFeedback: undefined,
};

export async function runLearningPathEval(): Promise<boolean> {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const state: PathState = {
				...EMPTY_STATE,
				...r.state,
			};

			const out = await reflectAndCheck(state);
			// reflectAndCheck returns { reflectionFeedback: undefined } when ok=true,
			// or { reflectionFeedback: <string>, reflectionAttempt: 1 } when ok=false.
			const wasApproved = out.reflectionFeedback === undefined;
			return { id: r.id, ok: wasApproved === r.expected.ok };
		}),
	);

	return accuracyGate("learningPath", results, 0.8);
}
