import { z } from "zod";
import type { DraftStep } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";
import { guardUserInput } from "@/server/services/_shared/aiGuard/guardUserInput";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import {
	checkAiRateLimit,
	validateMessageLength,
} from "@/server/services/_shared/aiLimits";
import { validateModelText } from "@/server/services/_shared/aiOutput";
import { RetryableNodeError } from "@/server/services/courseAI/courseAI.errors";
import { courseAIService } from "@/server/services/courseAI/courseAI.service";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

type Mode = "chat" | "finalize";

const CourseChatBodySchema = z.object({
	courseGenerationId: z.cuid().optional(),
	userMessage: z.string().min(1).optional(),
	mode: z.enum(["chat", "finalize"]).optional(),
});

export async function POST(req: Request) {
	const session = await getSession();
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	if ((session.user.role as string) !== "INSTRUCTOR") {
		return new Response("Forbidden", { status: 403 });
	}

	if (!checkAiRateLimit(session.user.id, "courseAI")) {
		return new Response("Too Many Requests", { status: 429 });
	}

	const parsedBody = CourseChatBodySchema.safeParse(await req.json());
	if (!parsedBody.success) {
		return new Response("Invalid request body", { status: 400 });
	}
	const body = parsedBody.data;
	const { userMessage } = body;
	const mode: Mode = body.mode === "finalize" ? "finalize" : "chat";

	if (mode === "chat" && !body.courseGenerationId && !userMessage) {
		return new Response("Message is required", { status: 400 });
	}

	if (userMessage && !validateMessageLength(userMessage)) {
		return new Response("Message too long", { status: 413 });
	}

	if (mode === "chat" && userMessage) {
		const guard = await guardUserInput(userMessage, {
			feature: "courseAI",
			userId: session.user.id,
			domain: {
				description:
					"designing an online course: its title, description, learning objectives, requirements, and curriculum",
				subject: "building your course",
			},
		});

		if (guard.outcome !== "allow") {
			// Returned before getOrCreateCourseGeneration and before the stream is
			// constructed, so the finally-block that persists the user message is
			// never reached — no CourseGenerationMessage row is written.
			const encoder = new TextEncoder();
			const sse = [
				`data: ${JSON.stringify({ type: "guard_blocked", message: guard.message })}\n\n`,
				`data: ${JSON.stringify({ type: "done" })}\n\n`,
			].join("");

			return new Response(encoder.encode(sse), {
				headers: {
					"Content-Type": "text/event-stream; charset=utf-8",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					"X-Accel-Buffering": "no",
				},
			});
		}
	}

	const abortSignal = req.signal;

	const courseGeneration = await courseAIService.getOrCreateCourseGeneration({
		courseGenerationId: body.courseGenerationId,
		userId: session.user.id,
	});

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (data: unknown) => {
				if (abortSignal.aborted) return;
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			let assistantFullText = "";
			let aborted = false;
			/** A provider or graph error reached the catch: nothing durable may follow. */
			let failed = false;
			/** revise_prior_field committed a field before the reply was judged (D-L). */
			let revisedThisTurn = false;
			const onAbort = () => {
				aborted = true;
				try {
					controller.close();
				} catch {}
			};
			abortSignal.addEventListener("abort", onAbort);

			try {
				send({ type: "start", courseGenerationId: courseGeneration.id });

				const events =
					mode === "chat"
						? await courseAIService.runChat({
								courseGeneration,
								userMessage: body.userMessage ?? "",
								signal: abortSignal,
							})
						: await courseAIService.runFinalize({
								courseGeneration,
								signal: abortSignal,
							});

				let lastConfidence: number | null = null;
				const STREAMING_NODES = new Set(["chat_response", "clarify"]);
				const INFORMATIVE_NODES = new Set([
					"classify_intent",
					"assess_completion",
					"extract_step_data",
					"validate",
					"confidence_score",
					"revise_prior_field",
				]);

				for await (const ev of events) {
					if (abortSignal.aborted) {
						aborted = true;
						break;
					}

					if (ev.event === "on_chat_model_stream") {
						const node = ev.metadata?.langgraph_node as string | undefined;
						if (!node || !STREAMING_NODES.has(node)) continue;
						const chunk = ev.data?.chunk as { content?: unknown } | undefined;
						const token = chunk?.content?.toString();
						if (token) {
							assistantFullText += token;
							send({ type: "token", value: token });
						}
					} else if (
						ev.event === "on_chain_end" &&
						ev.name === "revise_prior_field"
					) {
						// The durable write already happened inside the node, and the client
						// is about to know about it. If this turn's reply is later retracted,
						// that write still stands — see the finally block (D-L).
						revisedThisTurn = true;
						send({ type: "content_revised" });
					} else if (
						ev.event === "on_chain_start" &&
						INFORMATIVE_NODES.has(ev.name as string)
					) {
						send({ type: "node_start", node: ev.name });
					} else if (ev.event === "on_tool_start") {
						send({
							type: "tool_call",
							name: ev.name,
							args: (ev.data?.input ?? {}) as Record<string, unknown>,
						});
					} else if (
						ev.event === "on_chain_end" &&
						ev.name === "confidence_score"
					) {
						const out = ev.data?.output as { confidence?: number } | undefined;
						if (typeof out?.confidence === "number") {
							lastConfidence = out.confidence;
							send({ type: "confidence", value: out.confidence });
						}
					} else if (
						ev.event === "on_chain_end" &&
						ev.name === "persist_and_emit"
					) {
						const state = (ev.data?.input ?? {}) as Partial<{
							currentStep: DraftStep;
							shouldAutoAdvance: boolean;
							mode: Mode;
							confidence: number;
						}>;
						if (state.currentStep) {
							send({
								type: "step_committed",
								step: state.currentStep,
								autoAdvanced:
									state.mode === "chat" && state.shouldAutoAdvance === true,
								confidence: lastConfidence ?? state.confidence ?? 0,
							});
						}
					}
				}
			} catch (e) {
				failed = true;
				if (!abortSignal.aborted) {
					// Anything not thrown through withNodeErrors — notably a tool-argument
					// rejection from the unwrapped tool_node — is unclassified and so reads
					// as non-retryable. That is deliberate: an unknown shape is more likely
					// a bug than a transient fault.
					const retryable = e instanceof RetryableNodeError;
					logger.error(
						{ feature: "courseAI", retryable, err: e },
						"[courseAI] stream failed",
					);
					send({
						type: "error",
						retryable,
						message: retryable
							? "The AI service is briefly unavailable — please try again."
							: "Failed to generate AI response",
					});
				}
			} finally {
				// DETECTION, and the sole emitter. Unconditional, so "at most once per
				// turn" is structural: `finally` runs once per request and
				// validateModelText emits once per rejected call. No coordination with
				// the graph node, which runs the same check silently — a node cannot
				// fire on client abort or a mid-stream provider error, which are
				// exactly the two exits where tokens already reached the browser.
				const verdict = assistantFullText
					? validateModelText(assistantFullText, {
							feature: "courseAI",
							userId: session.user.id,
							subject: { kind: "generation", id: courseGeneration.id },
						})
					: ({ valid: true } as const);
				const isRejected = !verdict.valid;

				// D-L: revise_prior_field already wrote to CourseGeneration.content
				// before chat_response ran, and the client already saw content_revised.
				// The write stands — it passed its own authorization — so correlate it
				// with the adversarial signal rather than pretend the turn was inert.
				if (isRejected && revisedThisTurn) {
					logSecurityEvent({
						feature: "courseAI",
						userId: session.user.id,
						layer: "output_validation",
						outcome: "content_revised_retained",
						ruleIds: [verdict.ruleId],
						score: 0,
						subject: { kind: "generation", id: courseGeneration.id },
					});
				}

				// Ordering: event, then retraction, then the fallible writes. Nothing
				// that can throw sits between the event and the retract frame.
				if (isRejected) {
					send({ type: "retract", message: NEUTRAL_REFUSAL_MESSAGE });
				}

				// `failed` is not cosmetic: the assistant write used to sit inside the
				// try, so a mid-stream provider error skipped it. Gating only on
				// !aborted && !isRejected would persist the TRUNCATED reply, send done
				// after error, and replay that text into the next turn's context.
				const persistable = !aborted && !failed && !isRejected;
				if (persistable && assistantFullText) {
					await courseAIService
						.saveMessage(courseGeneration.id, {
							role: "assistant",
							content: assistantFullText,
							step: courseGeneration.step,
						})
						.catch((err) =>
							logger.error(
								{ feature: "courseAI", err },
								"[courseAI] failed to save the assistant message",
							),
						);
				}
				if (persistable) send({ type: "done" });

				// Save user message after the graph so state.history never contains
				// the current-turn message during this request (avoids duplication in
				// every node that appends state.userMessage to the history it builds).
				if (mode === "chat" && body.userMessage) {
					await courseAIService
						.saveMessage(courseGeneration.id, {
							role: "user",
							content: body.userMessage,
							step: courseGeneration.step,
							// The turn that elicited a retracted reply stays in the thread
							// and leaves the model's context.
							contextEligible: !isRejected,
						})
						.catch((err) =>
							logger.error(
								{ feature: "courseAI", err },
								"[courseAI] failed to save the user message",
							),
						);
				}
				abortSignal.removeEventListener("abort", onAbort);
				try {
					controller.close();
				} catch {}
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
