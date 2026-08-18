import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UNGUARDED_BY_DESIGN } from "./unguardedByDesign";

/** The two surfaces that DO run guardUserInput, per GuardContext["feature"]. */
const GUARDED_FEATURES = ["courseAI", "lessonAI"];

const ID_LIKE = /Id$/;
const MAX_ID_LENGTH = 64;

type ZodInternals = {
	def: {
		type: string;
		checks?: Array<{ _zod?: { def?: { check?: string; maximum?: number } } }>;
		shape?: Record<string, unknown>;
		element?: unknown;
		innerType?: unknown;
		options?: unknown[];
	};
};

const internals = (schema: unknown): ZodInternals["def"] =>
	(schema as ZodInternals).def;

const maxLength = (schema: unknown): number | null => {
	for (const check of internals(schema).checks ?? []) {
		const def = check._zod?.def;
		if (def?.check === "max_length" && typeof def.maximum === "number")
			return def.maximum;
	}
	return null;
};

/**
 * Every string a caller can send, as `path -> schema`. Objects and arrays are
 * traversed, so a free-text field buried one level down is found too.
 */
const stringFields = (
	schema: unknown,
	path = "",
): Array<{ path: string; schema: unknown }> => {
	const def = internals(schema);

	if (def.type === "string") return [{ path: path || "<root>", schema }];
	if (def.type === "object" && def.shape) {
		return Object.entries(def.shape).flatMap(([key, child]) =>
			stringFields(child, path ? `${path}.${key}` : key),
		);
	}
	if (def.type === "array" && def.element)
		return stringFields(def.element, `${path}[]`);
	if (
		(def.type === "optional" ||
			def.type === "nullable" ||
			def.type === "default") &&
		def.innerType
	)
		return stringFields(def.innerType, path);
	// enum / number / boolean and anything else carries no free text.
	return [];
};

describe("unguarded-by-design surfaces (AC 71)", () => {
	it("accounts for every AI surface exactly once", () => {
		const declared = UNGUARDED_BY_DESIGN.map((s) => s.feature);

		expect(new Set(declared).size).toBe(declared.length);
		expect([...declared, ...GUARDED_FEATURES].sort()).toEqual([
			"courseAI",
			"learningPathAI",
			"lessonAI",
			"lessonInsightsAI",
			"quizAI",
		]);
	});

	it("states a reason for each, not a bare exemption", () => {
		for (const surface of UNGUARDED_BY_DESIGN) {
			expect(surface.reason.length).toBeGreaterThan(60);
			expect(surface.inputDeclaredAt.length).toBeGreaterThan(0);
		}
	});

	it("admits no free-text string field in any of their inputs", () => {
		const freeText = UNGUARDED_BY_DESIGN.flatMap((surface) =>
			stringFields(surface.input)
				.filter(({ path, schema }) => {
					const bound = maxLength(schema);
					const idLike = ID_LIKE.test(path) || path === "<root>";
					return !(idLike || (bound !== null && bound <= MAX_ID_LENGTH));
				})
				.map(({ path }) => `${surface.feature}.${path}`),
		);

		expect(freeText).toEqual([]);
	});

	it("finds a free-text field when one is added", () => {
		const withPrompt = z.object({
			lessonId: z.string(),
			extraInstructions: z.string(),
		});

		expect(stringFields(withPrompt).map((f) => f.path)).toContain(
			"extraInstructions",
		);
	});

	it("keeps the learning-path router on the declared DTO", () => {
		const router = readFileSync("server/api/routers/learningPath.ts", "utf-8");

		expect(router).toContain("LearningPathCourseDto");
		expect(router).not.toContain("z.object({ courseId");
	});
});
