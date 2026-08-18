import { runAdversarialEval } from "./aiGuard/adversarial.eval";
import { runIndirectEval } from "./aiGuard/indirect.eval";
import { runRedteamEval } from "./aiGuard/redteam.eval";
import { runFalsePositiveEval } from "./aiOutput/falsePositive.eval";
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
	"courseAI:classifyIntent": runClassifyIntentEval,
	"courseAI:assessCompletion": runAssessCompletionEval,
	"courseAI:extractStepData": runExtractStepDataEval,
	"courseAI:confidenceScore": runConfidenceScoreEval,
	"lessonAI:tutor": runTutorEval,
	"lessonInsightsAI:lessonInsights": runLessonInsightsEval,
	"quizAI:quizGeneration": runQuizGenerationEval,
	"learningPathAI:learningPath": runLearningPathEval,
};

async function main() {
	const which = process.argv[2];

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
		allPassed &&= passed;
	}
	if (!allPassed) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
