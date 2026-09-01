import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LearningPathSchema } from "@/server/services/learningPathAI/schemas/learningPath.schema";
import {
	ConceptsSchema,
	GlossarySchema,
	SummarySchema,
} from "@/server/services/lessonInsightsAI/schemas/lessonInsights.schema";
import { QuizOutputSchema } from "@/server/services/quizAI/schemas/quizOutput.schema";

/**
 * Every schema here is handed to OpenAI as a strict `json_schema` response
 * format — `createAgent({ responseFormat })` for the quiz agent, plain
 * `withStructuredOutput(...)` for the rest. Strict mode has one rule that Zod
 * silently breaks: **every** key in `properties` must also appear in
 * `required`. A `.optional()` field satisfies Zod and 400s the request
 * ("'required' is required to be supplied and to be an array including every
 * key in properties"), on the *first* call, before a single token is generated
 * — so the whole surface is dead, not degraded.
 *
 * "May be absent" is expressed as `.nullable()` instead: the key stays required,
 * the type becomes `["string", "null"]`, and the untagged case still round-trips.
 *
 * This is a contract test rather than a lint rule because the breakage is in the
 * *generated* JSON Schema, not in the Zod source — `z.string().max(200).optional()`
 * reads fine.
 */
const STRICT_OUTPUT_SCHEMAS: ReadonlyArray<[string, z.ZodType]> = [
	["quizAI/QuizOutputSchema", QuizOutputSchema],
	["learningPathAI/LearningPathSchema", LearningPathSchema],
	["lessonInsightsAI/ConceptsSchema", ConceptsSchema],
	["lessonInsightsAI/GlossarySchema", GlossarySchema],
	["lessonInsightsAI/SummarySchema", SummarySchema],
];

type JsonSchemaNode = {
	properties?: Record<string, unknown>;
	required?: string[];
};

/**
 * Walks every object node, not just the root: the quiz failure was two levels
 * down, at `('properties', 'questions', 'items')`.
 */
const optionalKeyPaths = (node: unknown, path: string[] = []): string[] => {
	if (node === null || typeof node !== "object") return [];

	if (Array.isArray(node)) {
		return node.flatMap((child, index) =>
			optionalKeyPaths(child, [...path, String(index)]),
		);
	}

	const { properties, required } = node as JsonSchemaNode;
	const missing =
		properties === undefined
			? []
			: Object.keys(properties)
					.filter((key) => !(required ?? []).includes(key))
					.map((key) => [...path, "properties", key].join("."));

	const nested = Object.entries(node).flatMap(([key, child]) =>
		optionalKeyPaths(child, [...path, key]),
	);

	return [...missing, ...nested];
};

describe("strict structured-output schemas", () => {
	it.each(
		STRICT_OUTPUT_SCHEMAS,
	)("%s marks every property required", (_name, schema) => {
		const jsonSchema = z.toJSONSchema(schema, { io: "input" });

		expect(optionalKeyPaths(jsonSchema)).toEqual([]);
	});
});
