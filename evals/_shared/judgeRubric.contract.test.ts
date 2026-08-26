import { describe, expect, it } from "vitest";
import {
	buildJudgePrompt,
	JudgeScoresSchema,
	loadRubric,
	RUBRIC_PATH,
	rubricAxes,
} from "./judge";

/**
 * The rubric is the judge's prompt, so a rubric that drifts from the schema is
 * a judge scoring axes it is not asked about, or asked about axes it cannot
 * return. Neither shows up as a test failure anywhere else — the model would
 * simply return something the schema rejects, and every row would report as a
 * judge failure with no hint as to why.
 *
 * The doc is the source: axis anchors are prose a human maintains, and copying
 * them into TypeScript would make the copy the thing that runs while the
 * document quietly became decoration — the same defect the prompt-fidelity
 * work removed from the evals themselves.
 */

/** Every scored axis on the schema. `rationale` is prose, not an axis. */
const schemaAxes = Object.keys(JudgeScoresSchema.shape)
	.filter((key) => key !== "rationale")
	.sort();

describe("the rubric document defines the judge's axes", () => {
	it("finds the rubric where the judge expects it", () => {
		expect(loadRubric()).toContain("## Relevance");
	});

	it("documents exactly the axes the schema scores", () => {
		expect(rubricAxes(loadRubric())).toEqual(schemaAxes);
	});

	/**
	 * A `##` heading alone is not an axis — the document also has prose sections.
	 * An axis is a heading whose section carries the 1-5 anchor table, which is
	 * the thing that makes a score reproducible.
	 */
	it("does not mistake a prose section for an axis", () => {
		const axes = rubricAxes(loadRubric());

		expect(axes).not.toContain("known limits");
		expect(axes).not.toContain("output shape for the judge");
	});

	it("reports an axis documented but not scored", () => {
		const withExtra = `${loadRubric()}

## Conciseness

| Score | Anchor |
|---|---|
| **5** | Not a word wasted. |
| **1** | Padded. |
`;

		expect(rubricAxes(withExtra)).toContain("conciseness");
		expect(rubricAxes(withExtra)).not.toEqual(schemaAxes);
	});

	it("reports an axis scored but not documented", () => {
		const renamed = loadRubric().replace("## Groundedness", "## Inventedness");

		expect(rubricAxes(renamed)).not.toContain("groundedness");
		expect(rubricAxes(renamed)).not.toEqual(schemaAxes);
	});

	it("names the rubric path the judge actually reads", () => {
		expect(RUBRIC_PATH).toBe("docs/specs/ai-eval-rubric.md");
	});
});
describe("the judge prompt is built from the document", () => {
	it("carries the rubric's anchors, not a paraphrase of them", () => {
		const { systemPrompt } = buildJudgePrompt({
			question: "q",
			retrievedContent: "c",
			reply: "r",
		});

		// A line only the document contains: if the judge were prompted from a
		// copy, this would drift the moment the document was edited.
		expect(systemPrompt).toContain(
			"Every claim traces to a sentence in `retrievedContent`",
		);
	});
});
