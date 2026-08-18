import { validateModelText } from "@/server/services/_shared/aiOutput";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

/**
 * Purpose: runs the shared output boundary over the reply this turn assembled and
 * records the verdict, so a rejected reply cannot advance the step or reach a
 * durable write.
 * Reads: assistantText.
 * Writes: outputRejected.
 * Fails: cannot fail — validateModelText converts its own exceptions into a
 * rejection, so a validator bug blocks the turn rather than waving it through.
 *
 * Silent by design (`emit: false`). ENFORCEMENT lives here; DETECTION lives in
 * the route, which runs the same check unconditionally in a `finally`. Splitting
 * them that way is what makes "at most one event per turn" structural: a graph
 * node cannot run on client abort or a mid-stream provider error, and those are
 * exactly the two exits where tokens already reached the browser.
 *
 * Registered twice — once after chat_response, once after clarify — because both
 * nodes stream model-authored prose to the instructor.
 */
export const outputBoundary = withNodeErrors(
	"output_boundary",
	async (state: CourseBuilderStateT, _config) => {
		if (!state.assistantText) return { outputRejected: false };

		const verdict = validateModelText(state.assistantText, {
			feature: "courseAI",
			userId: state.instructorId,
			emit: false,
		});

		return { outputRejected: !verdict.valid };
	},
);
