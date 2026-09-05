import { describe, expect, it } from "vitest";
import { DraftStep } from "@/generated/prisma";
import { getExtractionSchemaForStep } from "./getExtractionSchemaForStep";
import { stepForField } from "./stepForField";

const STEPS = Object.values(DraftStep);

const topLevelKeys = (step: DraftStep): string[] =>
	Object.keys(getExtractionSchemaForStep(step).shape);

describe("stepForField", () => {
	it("resolves a basic field to the step that stores it", () => {
		expect(stepForField("level")).toBe(DraftStep.basic);
		expect(stepForField("title")).toBe(DraftStep.basic);
		expect(stepForField("duration")).toBe(DraftStep.basic);
	});

	it("resolves the list steps", () => {
		expect(stepForField("objectives")).toBe(DraftStep.objectives);
		expect(stepForField("requirements")).toBe(DraftStep.requirements);
		expect(stepForField("sections")).toBe(DraftStep.curriculum);
	});

	it("returns null for a field no step stores", () => {
		expect(stepForField("price")).toBeNull();
		expect(stepForField("")).toBeNull();
	});

	/**
	 * `in` walked the prototype chain and resolved all eight of these to `basic`,
	 * the first step tested. The field name comes from the model, and an
	 * instructor writing a JavaScript course says "constructor" meaning nothing by
	 * it — so this was reachable by accident, and it failed toward a confident
	 * revise rather than toward the clarify a null produces.
	 *
	 * Generated from `Object.prototype` rather than listed, so a runtime that
	 * grows a new prototype member is covered without anyone remembering.
	 */
	it("resolves nothing for a key only the prototype chain holds", () => {
		for (const key of Object.getOwnPropertyNames(Object.prototype)) {
			expect([key, stepForField(key)]).toEqual([key, null]);
		}
	});

	/**
	 * Generated from the schemas rather than listed, so a field added tomorrow is
	 * covered without anyone remembering to extend this file. That is the whole
	 * claim of the resolver: the map is the schema, not a copy of it.
	 */
	it("resolves every top-level key of every step to that step", () => {
		for (const step of STEPS) {
			for (const key of topLevelKeys(step)) {
				expect([key, stepForField(key)]).toEqual([key, step]);
			}
		}
	});

	/**
	 * The property that makes resolution unique — and the reason "change the
	 * title" has one answer. `title` is a top-level key of `basic` only; section
	 * and lesson titles live inside `sections[]`, where a field name cannot reach
	 * them.
	 *
	 * If this ever fails, the fix is NOT a tie-break rule. A colliding key means
	 * the field name has stopped identifying a step, and the node needs a
	 * different signal from the model — resolving to whichever step is checked
	 * first would route silently and wrongly, which is exactly the failure this
	 * resolver replaced.
	 */
	it("gives no key to two steps", () => {
		const seen = new Map<string, DraftStep>();
		const collisions: string[] = [];

		for (const step of STEPS) {
			for (const key of topLevelKeys(step)) {
				if (seen.has(key)) collisions.push(key);
				seen.set(key, step);
			}
		}

		expect(collisions).toEqual([]);
	});
});
