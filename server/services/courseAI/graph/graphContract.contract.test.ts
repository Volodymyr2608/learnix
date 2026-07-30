import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONTRACT_DOC = "docs/specs/features/ai-flow-contracts/graph-contract.md";
const COURSE_GRAPH = "server/services/courseAI/graph/graph.ts";
const PATH_GRAPH = "server/services/learningPathAI/learningPathAI.graph.ts";

/** ToolNode is a LangGraph prebuilt: a row in the table, but no module to document. */
const EXEMPT_FROM_JSDOC = ["tool_node"];

const REQUIRED_LABELS = ["Purpose:", "Reads:", "Writes:", "Fails:"];

const read = (path: string): string => readFileSync(path, "utf-8");

// `\s*` after the paren matters: Biome wraps a long .addNode( call across lines,
// and a node the scan cannot see is a node the contract cannot protect.
const registeredNodes = (source: string): string[] =>
	[...source.matchAll(/\.addNode\(\s*"([^"]+)"/g)].map((m) => m[1] as string);

const namedPredicates = (source: string): string[] => [
	...new Set(
		[...source.matchAll(/\.addConditionalEdges\([^,]+,\s*(\w+)/g)].map(
			(m) => m[1] as string,
		),
	),
];

const symbolForNode = (source: string, node: string): string | undefined =>
	new RegExp(`\\.addNode\\(\\s*"${node}",\\s*(\\w+)`).exec(source)?.[1];

/** The module a symbol is imported from, or undefined when it is declared locally. */
const importSpecFor = (source: string, symbol: string): string | undefined => {
	const match = new RegExp(
		`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`,
	).exec(source);
	return match?.[1];
};

/** A barrel import ("./nodes") hides the real file — search every module in it. */
const candidateFiles = (file: string): string[] => {
	if (!file.endsWith("/nodes.ts")) return [file];
	const dir = file.replace(/\.ts$/, "");
	return readdirSync(dir)
		.filter((entry) => entry.endsWith(".ts") && !entry.startsWith("index"))
		.map((entry) => `${dir}/${entry}`);
};

/**
 * `(?:(?!\*\/)[\s\S])*` forbids an intervening `*​/`, so the block must be the one
 * immediately above the export. A lazy `[\s\S]*?` would happily start at an
 * earlier sibling's comment and let a label-less block borrow its labels — which
 * is exactly how the two exports in decideStrategy.node.ts could slip through.
 * `export` is optional: a module-private route predicate is still documentable.
 */
const jsDocFor = (file: string, symbol: string): string | undefined => {
	const match = new RegExp(
		`/\\*\\*((?:(?!\\*/)[\\s\\S])*)\\*/\\s*(?:export\\s+)?(?:const|async function|function)\\s+${symbol}\\b`,
	).exec(read(file));
	return match?.[1];
};

describe("AI graph contract (ai-flow-contracts)", () => {
	const courseSource = read(COURSE_GRAPH);
	const pathSource = read(PATH_GRAPH);

	it("documents every registered node and named route predicate", () => {
		const doc = read(CONTRACT_DOC);
		const names = [
			...registeredNodes(courseSource),
			...namedPredicates(courseSource),
			...registeredNodes(pathSource),
			...namedPredicates(pathSource),
		];

		// Anchored to the first cell of a table row, not a bare substring: a name
		// mentioned only inside the mermaid block — or one that is a prefix of
		// another node's name — must not count as documented.
		const missing = names.filter(
			(name) => !new RegExp(`^\\|\\s*\`${name}\``, "m").test(doc),
		);

		expect(missing).toEqual([]);
	});

	it("gives every node module a four-label JSDoc block", () => {
		const targets = [
			{ graph: COURSE_GRAPH, source: courseSource },
			{ graph: PATH_GRAPH, source: pathSource },
		].flatMap(({ graph, source }) => {
			const dir = graph.slice(0, graph.lastIndexOf("/"));
			return [
				...registeredNodes(source)
					.filter((node) => !EXEMPT_FROM_JSDOC.includes(node))
					.map((node) => symbolForNode(source, node)),
				...namedPredicates(source),
			]
				.filter((symbol): symbol is string => Boolean(symbol))
				.map((symbol) => {
					const spec = importSpecFor(source, symbol);
					// No import means the symbol is declared in the graph file itself —
					// that is where every courseAI route predicate lives.
					const file = spec ? `${dir}/${spec.replace(/^\.\//, "")}.ts` : graph;
					return { symbol, file };
				});
		});

		const undocumented = targets.filter(({ symbol, file }) => {
			const block = candidateFiles(file)
				.map((candidate) => jsDocFor(candidate, symbol))
				.find(Boolean);
			return !block || !REQUIRED_LABELS.every((label) => block.includes(label));
		});

		expect(undocumented.map((t) => t.symbol)).toEqual([]);
	});
});
