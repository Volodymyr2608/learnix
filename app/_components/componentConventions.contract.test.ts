import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Component conventions, enforced instead of described (ADR-030, task A6).
 *
 * CLAUDE.md and ADR-011 state these as prose the model has to read and remember
 * every session. Two of them are mechanically checkable, so they are checked
 * here: a rule a test enforces cannot be forgotten, and it stops costing context
 * to carry.
 *
 * Only the checkable ones live here. "One component per folder" and "extract
 * repeated layout" need judgement about what counts as a component, and a test
 * that guesses at that would fail on legitimate code — worse than no test.
 */

const COMPONENTS_DIR = "app/_components";

/** `type FooProps = {` / `export interface FooProps {`, at the top level of a file. */
const INLINE_PROP_TYPE = /^(?:export\s+)?(?:type|interface)\s+\w*Props\b/m;

/** `export function Foo(` / `export default function Foo(` — components must be arrow consts. */
const FUNCTION_COMPONENT = /^export\s+(?:default\s+)?function\s+[A-Z]\w*/m;

const componentFiles = (dir: string): string[] => {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...componentFiles(full));
			continue;
		}
		if (entry.name === "index.tsx") found.push(full);
	}
	return found;
};

describe("component conventions (ADR-011)", () => {
	const files = componentFiles(COMPONENTS_DIR);

	it("finds the component tree", () => {
		// Guards the walker itself: a glob that silently matches nothing would make
		// every assertion below pass while checking not one file.
		expect(files.length).toBeGreaterThan(100);
	});

	it("keeps prop types in types.ts, never inline in index.tsx", () => {
		const offenders = files.filter((file) =>
			INLINE_PROP_TYPE.test(readFileSync(file, "utf-8")),
		);

		expect(
			offenders,
			"Move each `*Props` type into the folder's `types.ts` and import it " +
				"(CLAUDE.md → Component conventions).",
		).toEqual([]);
	});

	/**
	 * A ratchet, not a clean rule. 66 of 221 components still use `export
	 * function`, and converting them is a mechanical refactor with its own
	 * regression risk (default exports, hoisting) that belongs in its own plan —
	 * not smuggled into a process change.
	 *
	 * So the debt is pinned instead of pretended away: it cannot grow, and every
	 * conversion lowers the number. A red test nobody can fix gets skipped; a
	 * ratchet gets ratcheted.
	 */
	const FUNCTION_COMPONENT_BUDGET = 66;

	it("does not add new function-declaration components", () => {
		const offenders = files.filter((file) =>
			FUNCTION_COMPONENT.test(readFileSync(file, "utf-8")),
		);

		expect(
			offenders.length,
			offenders.length > FUNCTION_COMPONENT_BUDGET
				? "New component declared with `export function`. Write it as " +
						"`export const Foo = (props: FooProps) => { … }` (CLAUDE.md → Component conventions)."
				: `Converted ${FUNCTION_COMPONENT_BUDGET - offenders.length} — lower ` +
						`FUNCTION_COMPONENT_BUDGET to ${offenders.length} to hold the ground.`,
		).toBe(FUNCTION_COMPONENT_BUDGET);
	});
});
