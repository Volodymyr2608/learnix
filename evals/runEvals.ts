import {
	compareToBaseline,
	readBaseline,
	takeReportedRun,
	writeBaseline,
} from "./_shared/baseline";
import { runAdversarialEval } from "./aiGuard/adversarial.eval";
import { runIndirectEval } from "./aiGuard/indirect.eval";
import { runRedteamEval } from "./aiGuard/redteam.eval";
import { runFalsePositiveEval } from "./aiOutput/falsePositive.eval";
import { runLeakRecallEval } from "./aiOutput/leakRecall.eval";
import { runAssessCompletionEval } from "./courseAI/assessCompletion.eval";
import { runClassifyIntentEval } from "./courseAI/classifyIntent.eval";
import { runConfidenceScoreEval } from "./courseAI/confidenceScore.eval";
import { runExtractStepDataEval } from "./courseAI/extractStepData.eval";
import { runLearningPathEval } from "./learningPathAI/learningPath.eval";
import { runTutorEval } from "./lessonAI/tutor.eval";
import { runLessonInsightsEval } from "./lessonInsightsAI/lessonInsights.eval";
import { runQuizGenerationEval } from "./quizAI/quizGeneration.eval";

const EVALS: Record<string, () => Promise<boolean>> = {
	"aiGuard:adversarial": runAdversarialEval,
	"aiGuard:redteam": runRedteamEval,
	"aiGuard:indirect": runIndirectEval,
	"aiOutput:falsePositive": runFalsePositiveEval,
	"aiOutput:leak": runLeakRecallEval,
	"courseAI:classifyIntent": runClassifyIntentEval,
	"courseAI:assessCompletion": runAssessCompletionEval,
	"courseAI:extractStepData": runExtractStepDataEval,
	"courseAI:confidenceScore": runConfidenceScoreEval,
	"lessonAI:tutor": runTutorEval,
	"lessonInsightsAI:lessonInsights": runLessonInsightsEval,
	"quizAI:quizGeneration": runQuizGenerationEval,
	"learningPathAI:learningPath": runLearningPathEval,
};

/**
 * Compares this run against the committed baseline, or records a new one with
 * `--baseline`. Only evals that call `reportRun` take part; the rest are
 * unaffected.
 */
function handleBaseline(name: string, record: boolean): void {
	const metrics = takeReportedRun(name);
	if (!metrics) return;

	if (record) {
		console.log(`\nbaseline written: ${writeBaseline(name, metrics)}`);
		return;
	}

	const previous = readBaseline(name);
	if (!previous) {
		console.log(
			`\nno baseline for ${name} — record one with: pnpm eval ${name} --baseline`,
		);
		return;
	}

	const report = compareToBaseline(previous, metrics);
	console.log(`\nvs baseline (${previous.recordedAt}):`);
	console.log(report.changed ? report.lines.join("\n") : "  no category moved");
}

async function main() {
	const args = process.argv.slice(2);
	const record = args.includes("--baseline");
	const which = args.find((arg) => !arg.startsWith("--"));

	if (which && !(which in EVALS)) {
		console.log("Unknown eval:", which);
		console.log("Available:", Object.keys(EVALS).join(", "));
		process.exit(1);
	}

	const names = which ? [which] : Object.keys(EVALS);
	let allPassed = true;
	for (const name of names) {
		console.log(`\n=== ${name} ===`);
		const passed = await (EVALS[name] as () => Promise<boolean>)();
		handleBaseline(name, record);
		allPassed &&= passed;
	}
	if (!allPassed) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
