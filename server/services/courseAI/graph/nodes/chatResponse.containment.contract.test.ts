import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `state.messages` is where the tool loop deposits tool results, and
 * `search_similar_courses` puts *other instructors'* course titles and subtitles
 * there. `tool_router` reads it — that is the tool-choice prompt, and Task 4's
 * scan covers that file. `chat_response` streams straight to the instructor, so
 * it must not read that channel: doing so would let another tenant's copy reach
 * a streamed reply through a node with no output boundary in front of it.
 *
 * Deliberate exclusion, pinned at the source because the graph type would
 * happily allow it.
 */
const CHAT_RESPONSE = "server/services/courseAI/graph/nodes/chatResponse.ts";
const TOOL_ROUTER = "server/services/courseAI/graph/nodes/toolRouter.ts";

const source = (file: string): string => readFileSync(file, "utf-8");

/** Source with comments stripped — the invariant is about code, and the JSDoc
 * that explains it necessarily names the very thing the code must not do. */
const code = (file: string): string =>
	source(file)
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

describe("courseAI cross-tenant containment (AC 70)", () => {
	it("chat_response never reads state.messages", () => {
		expect(code(CHAT_RESPONSE)).not.toMatch(/state\.messages/);
	});

	it("strips comments before judging, so the JSDoc cannot satisfy or break it", () => {
		expect(source(CHAT_RESPONSE)).toMatch(/state\.messages/);
		expect(code(CHAT_RESPONSE)).not.toMatch(/state\.messages/);
	});

	it("records why, so the next reader does not add it back as a convenience", () => {
		expect(source(CHAT_RESPONSE)).toMatch(
			/state\.messages[\s\S]{0,400}(cross-tenant|other instructors)/i,
		);
	});

	it("tool_router does read it — the two facts are consistent, not contradictory", () => {
		// If this ever stops being true the invariant above is vacuous, and the
		// test that guards it should be re-derived rather than quietly passing.
		expect(source(TOOL_ROUTER)).toMatch(/state\.messages/);
	});
});
