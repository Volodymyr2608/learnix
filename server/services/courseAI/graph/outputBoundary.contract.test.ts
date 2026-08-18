import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GRAPH = readFileSync("server/services/courseAI/graph/graph.ts", "utf-8");
const NODE = readFileSync(
	"server/services/courseAI/graph/nodes/outputBoundary.ts",
	"utf-8",
);
const ROUTE = readFileSync("app/api/chat/course/route.ts", "utf-8");

/** Either registration of the one implementation ends a streaming path. */
const BOUNDARY_NODES = ["output_boundary", "output_boundary_clarify"];

/** `from -> to` edges, including every branch of a conditional edge. */
const edges = (): Array<[string, string]> => {
	const plain = [
		...GRAPH.matchAll(/\.addEdge\(\s*"([^"]+)",\s*"?(\w+)"?\)/g),
	].map((m) => [m[1] as string, m[2] as string] as [string, string]);

	const conditional = [
		...GRAPH.matchAll(
			/\.addConditionalEdges\(\s*"([^"]+)",\s*\w+,\s*\{([\s\S]*?)\}\)/g,
		),
	].flatMap(([, from, body]) =>
		[...(body as string).matchAll(/\w+:\s*"?(\w+)"?/g)].map(
			(m) => [from as string, m[1] as string] as [string, string],
		),
	);

	return [...plain, ...conditional];
};

/**
 * Every path from a streaming node to a node that persists or extracts, walked
 * depth-first. A path that reaches one without crossing a boundary is a reply
 * that can commit a step before anything has judged it.
 */
const reachesWithoutBoundary = (from: string, target: string): boolean => {
	const seen = new Set<string>();
	const all = edges();

	const walk = (node: string): boolean => {
		if (node === target) return true;
		if (seen.has(node) || BOUNDARY_NODES.includes(node)) return false;
		seen.add(node);
		return all
			.filter(([source]) => source === node)
			.some(([, next]) => walk(next));
	};

	return all
		.filter(([source]) => source === from)
		.some(([, next]) => walk(next));
};

describe("the output boundary sits on every streaming path (AC 13)", () => {
	it("registers the boundary twice, once per streaming node", () => {
		for (const node of BOUNDARY_NODES) {
			expect(GRAPH).toContain(`.addNode("${node}", outputBoundary)`);
		}
	});

	it("puts it directly after chat_response and clarify", () => {
		expect(edges()).toContainEqual(["chat_response", "output_boundary"]);
		expect(edges()).toContainEqual(["clarify", "output_boundary_clarify"]);
	});

	it("routes a rejected turn to END", () => {
		expect(GRAPH).toMatch(/rejected:\s*END/);
		expect(GRAPH).toMatch(/assess:\s*"assess_completion"/);
	});

	it("leaves no path from chat_response to a persisting node that skips it", () => {
		for (const target of ["persist_and_emit", "extract_step_data"]) {
			expect(
				reachesWithoutBoundary("chat_response", target),
				`chat_response reaches ${target} without a boundary`,
			).toBe(false);
		}
	});

	it("detects the gap it is meant to detect — the walk is not vacuous", () => {
		// Without the boundary in the way, chat_response DOES reach assess_completion:
		// if this were false the test above would pass for the wrong reason.
		expect(edges().some(([from]) => from === "output_boundary")).toBe(true);
		expect(reachesWithoutBoundary("output_boundary", "assess_completion")).toBe(
			true,
		);
	});
});

describe("enforcement and detection are split on purpose (AC 15, 16)", () => {
	it("the graph node is silent", () => {
		expect(NODE).toMatch(/emit:\s*false/);
	});

	it("the route validates in a finally, on every exit", () => {
		const finallyBlock = ROUTE.slice(ROUTE.indexOf("} finally {"));

		expect(finallyBlock).toContain("validateModelText(assistantFullText");
		expect(finallyBlock).not.toContain("emit: false");
	});

	it("the route is the only emitter for courseAI", () => {
		// The node enforces; if it also emitted, a completed rejected turn would
		// produce two events for one reply.
		expect(NODE).not.toContain("logSecurityEvent");
	});

	it("persists nothing durable when the verdict rejects", () => {
		const finallyBlock = ROUTE.slice(ROUTE.indexOf("} finally {"));

		expect(finallyBlock).toMatch(
			/const persistable = !aborted && !failed && !isRejected;/,
		);
		expect(finallyBlock).toMatch(
			/if \(persistable\) send\(\{ type: "done" \}\)/,
		);
	});

	it("sends the retraction before any fallible write (AC 17)", () => {
		const finallyBlock = ROUTE.slice(ROUTE.indexOf("} finally {"));
		const retractAt = finallyBlock.indexOf('type: "retract"');
		const saveAt = finallyBlock.indexOf("saveMessage");

		expect(retractAt).toBeGreaterThan(-1);
		expect(retractAt).toBeLessThan(saveAt);
	});

	it("correlates a retained revise write instead of pretending the turn was inert (D-L)", () => {
		expect(ROUTE).toContain("content_revised_retained");
		expect(ROUTE).toMatch(/isRejected && revisedThisTurn/);
	});

	it("marks the eliciting user turn context-ineligible", () => {
		expect(ROUTE).toMatch(/contextEligible: !isRejected/);
	});
});
