import { runAssessCompletionEval } from "./courseAI/assessCompletion.eval";
import { runClassifyIntentEval } from "./courseAI/classifyIntent.eval";
import { runConfidenceScoreEval } from "./courseAI/confidenceScore.eval";
import { runExtractStepDataEval } from "./courseAI/extractStepData.eval";

const EVALS: Record<string, () => Promise<void>> = {
  "courseAI:classifyIntent": runClassifyIntentEval,
  "courseAI:assessCompletion": runAssessCompletionEval,
  "courseAI:extractStepData": runExtractStepDataEval,
  "courseAI:confidenceScore": runConfidenceScoreEval,
};

async function main() {
  const which = process.argv[2];
  if (!which || !(which in EVALS)) {
    console.log("Usage: pnpm eval <name>");
    console.log("Available:", Object.keys(EVALS).join(", "));
    process.exit(1);
  }
  await EVALS[which]!();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});