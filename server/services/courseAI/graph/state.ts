import type { InteropZodType } from "@langchain/core/utils/types";
import { withLangGraph } from "@langchain/langgraph/zod";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";

const appendList = () =>
	withLangGraph(
		z.array(z.unknown()).default(() => []) as unknown as InteropZodType<
			unknown[]
		>,
		{
			reducer: {
				fn: (prev: unknown[], next: unknown | unknown[]) =>
					prev.concat(Array.isArray(next) ? next : [next]),
				schema: z.union([
					z.unknown(),
					z.array(z.unknown()),
				]) as unknown as InteropZodType<unknown | unknown[]>,
			},
		},
	);

const draftStep = z.enum(
	Object.values(DraftStep) as [DraftStep, ...DraftStep[]],
);

const historyEntry = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.string(),
	step: draftStep,
});

export const CourseBuilderState = z.object({
	// hydrated at request start
	generationId: z.string(),
	instructorId: z.string(),
	currentStep: draftStep,
	content: z.record(z.string(), z.unknown()).default(() => ({})),
	history: z.array(historyEntry).default(() => []),
	mode: z.enum(["chat", "finalize"]),

	// current turn — set by route handler
	userMessage: z.string().default(""),

	// produced by nodes
	intent: z.enum(["continue", "revise", "clarify"]).nullable().default(null),
	reviseTarget: draftStep.nullable().default(null),
	toolCalls: appendList(),
	assessReady: z.boolean().default(false),
	// Set by assess_completion when the user's intent is genuinely ambiguous.
	// Routes to clarify node which streams the question; null otherwise.
	assessClarify: z.string().nullable().default(null),
	draftStepData: z.unknown().default(undefined),
	confidence: z.number().min(0).max(1).default(0),
	shouldAutoAdvance: z.boolean().default(false),
	assistantText: withLangGraph(
		z.string().default("") as unknown as InteropZodType<string>,
		{
			reducer: {
				fn: (prev: string, next: string) => prev + next,
				schema: z.string() as unknown as InteropZodType<string>,
			},
		},
	),
	validationErrors: z.array(z.unknown()).nullable().default(null),
	// Cleared each toolRouter pass — never accumulated. Used only for routing.
	pendingToolCalls: z.array(z.unknown()).default(() => []),
	// LangChain BaseMessage[] for the current tool-call loop. Append-only within a single request.
	// ToolNode reads the last AIMessage here; toolRouter appends its response and reads prior results.
	messages: appendList(),
});

// z.infer<> gives `unknown` for withLangGraph fields due to the `as unknown as InteropZodType<>`
// casts those fields require. Declare the runtime shape explicitly instead.
export type CourseBuilderStateT = {
	generationId: string;
	instructorId: string;
	currentStep: DraftStep;
	content: Record<string, unknown>;
	history: Array<{
		role: "user" | "assistant";
		content: string;
		step: DraftStep;
	}>;
	mode: "chat" | "finalize";
	userMessage: string;
	intent: "continue" | "revise" | "clarify" | null;
	reviseTarget: DraftStep | null;
	toolCalls: unknown[];
	assessReady: boolean;
	assessClarify: string | null;
	draftStepData: unknown;
	confidence: number;
	shouldAutoAdvance: boolean;
	assistantText: string;
	validationErrors: unknown[] | null;
	pendingToolCalls: unknown[];
	messages: unknown[];
};
