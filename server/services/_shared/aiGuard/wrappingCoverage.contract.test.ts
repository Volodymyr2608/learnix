import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { EXEMPT_MODEL_CALLERS, GUARDED_ENTRY_POINTS } from "./entryPoints";
import {
	ALLOWED_INTERPOLATIONS,
	TRUSTED_EXPRESSIONS,
	TRUSTED_INTERPOLATIONS,
} from "./wrappingCoverage";

type Finding = { file: string; line: number; text: string; root: string };

/** Object-literal keys that carry model input, on any of these call targets. */
const MODEL_INPUT_KEYS = new Set(["content", "input", "question", "text"]);
const MODEL_INPUT_CALLS = new Set(["invoke", "format", "pipe"]);

const FIXTURES = "server/services/_shared/aiGuard/__fixtures__";

const isWrapCall = (node: ts.Node): boolean =>
	ts.isCallExpression(node) &&
	ts.isIdentifier(node.expression) &&
	node.expression.text === "wrapUntrustedContent";

const insideWrap = (node: ts.Node): boolean => {
	for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
		if (isWrapCall(cur)) return true;
	}
	return false;
};

const isJsonStringify = (n: ts.Node): n is ts.CallExpression =>
	ts.isCallExpression(n) &&
	ts.isPropertyAccessExpression(n.expression) &&
	ts.isIdentifier(n.expression.expression) &&
	n.expression.expression.text === "JSON" &&
	n.expression.name.text === "stringify";

/**
 * For a CallExpression the naive loop unwinds to the CALLEE, so every
 * JSON.stringify(x) collapses to "JSON" regardless of the argument — and the
 * tempting repair (trust "JSON") would wave through every interpolation nested
 * in any stringify call. Serialisation wrappers recurse into their first
 * ARGUMENT instead.
 */
const rootNode = (expr: ts.Expression): ts.Node => {
	if (isJsonStringify(expr) && expr.arguments[0])
		return rootNode(expr.arguments[0]);
	let cur: ts.Node = expr;
	while (
		ts.isPropertyAccessExpression(cur) ||
		ts.isCallExpression(cur) ||
		ts.isNonNullExpression(cur) ||
		ts.isElementAccessExpression(cur)
	) {
		cur = cur.expression;
	}
	return cur;
};

/**
 * A literal this file authored. Its own interpolations are visited as
 * TemplateSpans and judged there, so flagging the assembled string again would
 * report the same value twice and bury the findings that matter.
 */
const isAuthoredLiteral = (node: ts.Node): boolean =>
	ts.isTemplateExpression(node) ||
	ts.isNoSubstitutionTemplateLiteral(node) ||
	ts.isStringLiteral(node) ||
	ts.isNumericLiteral(node) ||
	node.kind === ts.SyntaxKind.TrueKeyword ||
	node.kind === ts.SyntaxKind.FalseKeyword;

/** True when the subtree assembles a template — i.e. its parts are scanned individually. */
const containsTemplate = (node: ts.Node): boolean => {
	if (ts.isTemplateExpression(node)) return true;
	return ts.forEachChild(node, containsTemplate) ?? false;
};

/** File-local `const`/`let` declarations, by name. */
const collectLocalBindings = (
	source: ts.SourceFile,
): Map<string, ts.Expression> => {
	const bindings = new Map<string, ts.Expression>();
	const visit = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer
		) {
			bindings.set(node.name.text, node.initializer);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return bindings;
};

const scan = (file: string): Finding[] => {
	const source = ts.createSourceFile(
		file,
		readFileSync(file, "utf-8"),
		ts.ScriptTarget.ES2022,
		true,
	);
	const findings: Finding[] = [];
	const bindings = collectLocalBindings(source);

	const record = (node: ts.Node, expr: ts.Expression, seen = 0) => {
		// The wrap call is a DESCENDANT of the flagged node, never an ancestor —
		// `${wrapUntrustedContent(x, "y")}` records the TemplateSpan with expr =
		// the wrap call itself. Without this clause the scanner flags every
		// correctly-wrapped site.
		if (isWrapCall(expr) || insideWrap(node)) return;

		// A branch or an operand is judged on its own: `x ? wrap(x) : "none"` is
		// wrapped, and `a + b` is exactly as trusted as its two halves.
		if (ts.isConditionalExpression(expr)) {
			record(node, expr.whenTrue, seen);
			record(node, expr.whenFalse, seen);
			return;
		}
		if (ts.isBinaryExpression(expr)) {
			record(node, expr.left, seen);
			record(node, expr.right, seen);
			return;
		}
		if (ts.isParenthesizedExpression(expr))
			return record(node, expr.expression, seen);

		const root = rootNode(expr);
		if (isAuthoredLiteral(root)) return;

		// A file-local binding is judged at its declaration. A binding that merely
		// forwards a value (`const body = lesson.content`) is judged as that value,
		// because that is what has to be wrapped. A binding assembled in-file — a
		// call or an object literal — is left to the walker, which visits its parts
		// where they are written. The gap that leaves is a `.map(m => m.content)`
		// with no template anywhere in the chain; no such shape exists here, and
		// the fixtures pin the shapes that do.
		if (ts.isIdentifier(root) && bindings.has(root.text) && seen < 5) {
			const initializer = bindings.get(root.text) as ts.Expression;
			if (containsTemplate(initializer) || insideWrap(initializer)) return;
			const forwards =
				ts.isPropertyAccessExpression(initializer) ||
				ts.isElementAccessExpression(initializer) ||
				ts.isIdentifier(initializer);
			if (!forwards) return;
			return record(node, initializer, seen + 1);
		}

		const name = ts.isIdentifier(root) ? root.text : root.getText();
		if (TRUSTED_INTERPOLATIONS.includes(name)) return;
		const text = expr.getText();
		if (TRUSTED_EXPRESSIONS.some((t) => t.expression === text)) return;
		if (
			ALLOWED_INTERPOLATIONS.some(
				(a) => a.file === file && a.expression === text,
			)
		)
			return;
		const { line } = source.getLineAndCharacterOfPosition(expr.getStart());
		findings.push({ file, line: line + 1, text, root: name });
	};

	const visit = (node: ts.Node): void => {
		if (ts.isTemplateSpan(node)) record(node, node.expression);

		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			MODEL_INPUT_CALLS.has(node.expression.name.text)
		) {
			for (const arg of node.arguments) {
				if (!ts.isObjectLiteralExpression(arg)) continue;
				for (const prop of arg.properties) {
					// Shorthand (`{ level }`) is the idiom a developer reaches for
					// first, so default-deny has to see through it too.
					if (ts.isShorthandPropertyAssignment(prop)) {
						record(prop, prop.name);
						continue;
					}
					if (
						ts.isPropertyAssignment(prop) &&
						!ts.isStringLiteral(prop.initializer) &&
						!ts.isNoSubstitutionTemplateLiteral(prop.initializer)
					) {
						record(prop, prop.initializer);
					}
				}
			}
		}

		// A bare `{ role, content }` message object, wherever it is built. Scoped to
		// objects that also carry `role`: `{ content }` alone is just as often a
		// Prisma write, and flagging those buries the prompt findings in noise.
		if (
			ts.isObjectLiteralExpression(node) &&
			node.properties.some(
				(p) => p.name && ts.isIdentifier(p.name) && p.name.text === "role",
			)
		) {
			for (const prop of node.properties) {
				if (
					ts.isPropertyAssignment(prop) &&
					ts.isIdentifier(prop.name) &&
					MODEL_INPUT_KEYS.has(prop.name.text) &&
					!ts.isStringLiteral(prop.initializer) &&
					!ts.isNoSubstitutionTemplateLiteral(prop.initializer) &&
					!ts.isTemplateExpression(prop.initializer)
				) {
					record(prop, prop.initializer);
				}
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(source);
	return findings;
};

const ALL_MODEL_FILES = [...GUARDED_ENTRY_POINTS, ...EXEMPT_MODEL_CALLERS];

describe("wrapping completeness (AC 59-64)", () => {
	it("scans every model-calling file, exempt or not", () => {
		// An exemption is honoured per-expression with a reason, never by absence
		// from the scan set — that is registration-scoped completeness, the failure
		// this feature exists to end.
		expect(ALL_MODEL_FILES.length).toBeGreaterThanOrEqual(20);
		for (const file of EXEMPT_MODEL_CALLERS) {
			expect(ALL_MODEL_FILES).toContain(file);
		}
	});

	it("every interpolation is wrapped or allow-listed with a reason", () => {
		const findings = ALL_MODEL_FILES.flatMap(scan);
		const message = findings
			.map(
				(f) =>
					`${f.file}:${f.line} — ${f.text}\n` +
					"  Remedy 1: wrap it — wrapUntrustedContent(<expr>, <source>)\n" +
					"  Remedy 2: if server-authored, add it to TRUSTED_INTERPOLATIONS or " +
					"ALLOWED_INTERPOLATIONS with a reason (wrappingCoverage.ts)",
			)
			.join("\n");
		expect(findings, message).toEqual([]);
	});

	it("holds no trust entry that would switch default-deny off (AC 63)", () => {
		for (const forbidden of ["wrapUntrustedContent", "JSON"]) {
			expect(TRUSTED_INTERPOLATIONS).not.toContain(forbidden);
			expect(TRUSTED_EXPRESSIONS.map((t) => t.expression)).not.toContain(
				forbidden,
			);
		}
	});

	it("gives every exemption a reason and a file that is actually scanned (AC 64)", () => {
		for (const entry of [...ALLOWED_INTERPOLATIONS, ...TRUSTED_EXPRESSIONS]) {
			expect(entry.reason.length).toBeGreaterThan(30);
		}
		for (const entry of ALLOWED_INTERPOLATIONS) {
			expect(ALL_MODEL_FILES).toContain(entry.file);
		}
	});

	it("holds no stale exemption — every allowed expression is still in its file", () => {
		const stale = ALLOWED_INTERPOLATIONS.filter(
			(entry) => !readFileSync(entry.file, "utf-8").includes(entry.expression),
		).map((entry) => `${entry.file} — ${entry.expression}`);

		expect(stale).toEqual([]);
	});

	it("passes on the correctly-wrapped multi-line enrichedCandidates call (AC 60)", () => {
		expect(
			scan("server/services/learningPathAI/nodes/mergeAndExplain.node.ts"),
		).toEqual([]);
	});

	it("sees a literal-free `.invoke({ content })` shape (AC 61)", () => {
		expect(
			scan(`${FIXTURES}/unwrappedInvoke.fixture.ts`).map((f) => f.text),
		).toContain("lesson.content");
	});

	it("sees a `.format({ … })` argument, shorthand included (quizAI's shape)", () => {
		expect(
			scan(`${FIXTURES}/unwrappedFormat.fixture.ts`).map((f) => f.text),
		).toContain("level");
	});

	it("flags an unwrapped template interpolation (default-deny, AC 59)", () => {
		const findings = scan(`${FIXTURES}/unwrappedTemplate.fixture.ts`);
		expect(findings.map((f) => f.text)).toEqual(["evil"]);
	});

	it("does not collapse JSON.stringify to the callee name", () => {
		const findings = scan(`${FIXTURES}/unwrappedTemplate.fixture.ts`);

		// The fixture stringifies a TRUSTED constant. Collapsing to the callee
		// would make its root "JSON", which is trusted nowhere, so the expression
		// would be flagged — that is the bug this asserts against.
		expect(findings.map((f) => f.root)).toEqual(["evil"]);
		expect(findings.map((f) => f.text)).not.toContain(
			"JSON.stringify(UNTRUSTED_DATA_CLAUSE)",
		);
	});
});
