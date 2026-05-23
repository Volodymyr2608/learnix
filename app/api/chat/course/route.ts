import type { DraftStep } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";
import { courseAIService } from "@/server/services/courseAI/courseAI.service";

export const runtime = "nodejs";

type Mode = "chat" | "finalize";

export async function POST(req: Request) {
	const session = await getSession();
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = (await req.json()) as {
		courseGenerationId?: string;
		userMessage?: string;
		mode?: Mode;
	};
	const mode: Mode = body.mode === "finalize" ? "finalize" : "chat";

	if (mode === "chat" && !body.userMessage) {
		return new Response("Message is required", { status: 400 });
	}

	const abortSignal = req.signal;

	const courseGeneration = await courseAIService.getOrCreateCourseGeneration({
		courseGenerationId: body.courseGenerationId,
		userId: session.user.id,
	});

	if (mode === "chat" && body.userMessage) {
		await courseAIService.saveMessage(courseGeneration.id, {
			role: "user",
			content: body.userMessage,
			step: courseGeneration.step,
		});
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (data: unknown) => {
				if (abortSignal.aborted) return;
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
				);
			};

			let assistantFullText = "";
			let aborted = false;
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

				for await (const ev of events) {
					if (abortSignal.aborted) {
						aborted = true;
						break;
					}

					if (ev.event === "on_chat_model_stream") {
						const chunk = ev.data?.chunk as { content?: unknown } | undefined;
						const token = chunk?.content?.toString();
						if (token) {
							assistantFullText += token;
							send({ type: "token", value: token });
						}
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
						const out = ev.data?.output as
							| { confidence?: number }
							| undefined;
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

				if (!aborted && assistantFullText) {
					await courseAIService.saveMessage(courseGeneration.id, {
						role: "assistant",
						content: assistantFullText,
						step: courseGeneration.step,
					});
				}
				if (!aborted) send({ type: "done" });
			} catch (e) {
				if (!abortSignal.aborted) {
					console.error("[Course AI stream error]", e);
					send({ type: "error", message: "Failed to generate AI response" });
				}
			} finally {
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