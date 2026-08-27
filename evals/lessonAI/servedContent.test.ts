import { describe, expect, it } from "vitest";
import { buildStubTools } from "./tutor.eval";

/**
 * The judge scores faithfulness against the content the tutor was given, so it
 * must be handed that exact text.
 *
 * This existed as a reconstruction — `row.input.retrieved ?? "No relevant
 * content found for this lesson."` — computed separately from the stub's own
 * `row.input.retrieved ?? "Relevant lesson content returned."`. Two defaults
 * for one absent field meant 9 of 24 judged rows were graded against a
 * document the tutor never received, including every cross-lesson row (whose
 * content lives in `crossLesson`, which the reconstruction never read) and
 * every bait row (where `""` is not nullish, so the judge saw an empty block
 * while the tool returned the real empty-search string).
 */

const invoke = async (tool: unknown): Promise<string> =>
	(await (tool as { invoke: (a: unknown) => Promise<string> }).invoke({
		query: "a real query",
	})) as string;

const row = (input: Record<string, unknown>) =>
	({
		id: "t",
		category: "valid",
		input: { lessonTitle: "L", question: "q", ...input },
		expected: {},
	}) as never;

describe("served content is what the tools actually returned", () => {
	it("records the lesson chunk retrieve_lesson_context served", async () => {
		const { tools, served } = buildStubTools(
			row({ retrieved: "Hooks hold state." }),
		);

		await invoke(tools[0]);

		expect(served).toEqual(["Hooks hold state."]);
	});

	/** The cross-lesson case the reconstruction could not see at all. */
	it("records the cross-lesson chunk search_across_course served", async () => {
		const { tools, served } = buildStubTools(
			row({ crossLesson: "[Lesson: Callbacks] Promises appeared here." }),
		);

		await invoke(tools[1]);

		expect(served).toEqual(["[Lesson: Callbacks] Promises appeared here."]);
	});

	/** A bait row: `""` means the real tool's empty-search string, not "". */
	it("records the real empty-search string when retrieval is staged empty", async () => {
		const { tools, served } = buildStubTools(row({ retrieved: "" }));

		await invoke(tools[0]);

		expect(served).toEqual(["No relevant content found for this lesson."]);
		expect(served[0]).not.toBe("");
	});

	it("records nothing when no retrieval tool ran", () => {
		const { served } = buildStubTools(row({ retrieved: "x" }));

		expect(served).toEqual([]);
	});

	it("keeps both chunks, in call order, when both tools ran", async () => {
		const { tools, served } = buildStubTools(
			row({ retrieved: "lesson text", crossLesson: "course text" }),
		);

		await invoke(tools[1]);
		await invoke(tools[0]);

		expect(served).toEqual(["course text", "lesson text"]);
	});
});
