import { runAssessCompletionEval } from "./courseAI/assessCompletion.eval";
import { runClassifyIntentEval } from "./courseAI/classifyIntent.eval";
import { runConfidenceScoreEval } from "./courseAI/confidenceScore.eval";
import { runExtractStepDataEval } from "./courseAI/extractStepData.eval";

const EVALS: Record<string, () => Promise<boolean>> = {
	"courseAI:classifyIntent": runClassifyIntentEval,
	"courseAI:assessCompletion": runAssessCompletionEval,
	"courseAI:extractStepData": runExtractStepDataEval,
	"courseAI:confidenceScore": runConfidenceScoreEval,
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
		const passed = await EVALS[name]!();
		allPassed &&= passed;
	}
	if (!allPassed) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
