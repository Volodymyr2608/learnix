/**
 * Offline eval runner for LangSmith datasets (ADR-013).
 * Run with: pnpm eval
 *
 * Each dataset entry is evaluated against the relevant AI service.
 * Scoring uses LangSmith evaluate() with LLMAsJudge for prose quality
 * and schema / keyword matching for structural correctness.
 *
 * Datasets:
 *   evals/datasets/lessonInsights.jsonl — Lesson Auto-Summary (Feature #3)
 *   evals/datasets/tutor.jsonl          — AI Course Tutor (Feature #1)
 *
 * NOTE: Full eval implementations are added as each feature ships.
 * This file is the runner scaffold; replace the stubs below with real
 * evaluate() calls once the corresponding services exist.
 */

async function main() {
	console.log("Eval runner — no datasets wired yet.");
	console.log(
		"Add evaluate() calls here as features ship (see ADR-013 for the pattern).",
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
