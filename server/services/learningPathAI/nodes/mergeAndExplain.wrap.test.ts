import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";

/**
 * `buildPromptMessages` is module-private and the node's only export needs a
 * database, so the wrapping is pinned at the source. The scanner in Task 4
 * generalises this; these two assertions are the fix's own regression test.
 */
const SOURCE = readFileSync(
	"server/services/learningPathAI/nodes/mergeAndExplain.node.ts",
	"utf-8",
);

const humanContent = (): string => {
	const match = SOURCE.match(/const humanContent = `([\s\S]*?)`;\n/);
	if (!match?.[1]) throw new Error("humanContent template literal not found");
	return match[1];
};

/**
 * The innermost `${…}` expression containing `field`. A window of surrounding
 * characters is not good enough: the neighbouring candidate-steps interpolation
 * already calls the wrapper, so a loose window passes while the field itself is
 * still raw.
 */
const interpolationFor = (field: string): string => {
	const template = humanContent();
	const target = template.indexOf(field);
	if (target === -1) throw new Error(`${field} is not interpolated at all`);

	const open: number[] = [];
	const spans: Array<[number, number]> = [];
	for (let i = 0; i < template.length; i++) {
		if (template[i] === "$" && template[i + 1] === "{") {
			open.push(i + 2);
			i++;
			continue;
		}
		if (template[i] === "}" && open.length > 0) {
			const start = open.pop() as number;
			spans.push([start, i]);
		}
	}

	const enclosing = spans
		.filter(([start, end]) => start <= target && target < end)
		.sort((a, b) => b[0] - a[0])[0];
	if (!enclosing) throw new Error(`${field} is not inside an interpolation`);

	return template.slice(enclosing[0], enclosing[1]);
};

describe("mergeAndExplain wraps every model- and content-derived value (AC 62)", () => {
	it("wraps state.weakConcepts before it reaches the prompt", () => {
		expect(interpolationFor("state.weakConcepts")).toContain(
			"wrapUntrustedContent(",
		);
	});

	it("wraps state.reflectionFeedback — a critic model's own prose", () => {
		expect(interpolationFor("state.reflectionFeedback")).toContain(
			"wrapUntrustedContent(",
		);
	});

	it("labels critic output as model_output, not as lesson content", () => {
		expect(SOURCE).toContain('"model_output"');
	});

	it("model_output is a real UntrustedSource that the wrapper renders", () => {
		expect(wrapUntrustedContent("critique", "model_output")).toBe(
			'<untrusted_data source="model_output">\ncritique\n</untrusted_data>',
		);
	});
});
