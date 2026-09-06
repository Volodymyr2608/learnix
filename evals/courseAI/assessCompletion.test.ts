import { describe, expect, it } from "vitest";
import { decisionOf } from "./assessCompletion.eval";

/**
 * The node returns one of three decisions and writes two fields
 * (`server/services/courseAI/graph/nodes/assessCompletion.ts:85-92`):
 * `ready` sets `assessReady`, `ask` sets `assessClarify` to the question (or to
 * a default when the model omits one, so it is never an empty string), and
 * `not_ready` sets neither.
 *
 * The eval used to score `assessReady` alone, which folds `ask` into
 * `not_ready`: the clarify path could regress to never firing without moving a
 * number. Same shape as the defect this whole change exists to close — a path
 * that is not measured cannot be seen to stop working.
 *
 * **Known limit, stated rather than discovered later:** the node's own catch
 * returns `{ assessReady: false, assessClarify: null }` on a model error, so a
 * failed call is indistinguishable here from a genuine `not_ready`. What
 * separates them is `callCoverage`, which compares calls made against rows
 * scored — not this function, which only sees the output.
 */
describe("decisionOf reads the node's three decisions from what it writes", () => {
	it("reads a set assessReady as ready", () => {
		expect(decisionOf({ assessReady: true, assessClarify: null })).toBe(
			"ready",
		);
	});

	it("reads a clarify question as ask", () => {
		expect(
			decisionOf({ assessReady: false, assessClarify: "Shall I finalize?" }),
		).toBe("ask");
	});

	it("reads neither as not_ready", () => {
		expect(decisionOf({ assessReady: false, assessClarify: null })).toBe(
			"not_ready",
		);
	});

	/**
	 * The pair the node cannot produce. Resolved to `ready` deliberately: if the
	 * two ever co-occur, the advance is the consequential half — a row scored
	 * `ask` while the graph advanced would describe the wrong outcome.
	 */
	it("prefers the advance when both are somehow set", () => {
		expect(
			decisionOf({ assessReady: true, assessClarify: "Shall I finalize?" }),
		).toBe("ready");
	});

	/** The conflation the boolean caused, pinned from the other side. */
	it("does not read ask and not_ready as the same outcome", () => {
		expect(
			decisionOf({ assessReady: false, assessClarify: "Which one?" }),
		).not.toBe(decisionOf({ assessReady: false, assessClarify: null }));
	});
});
