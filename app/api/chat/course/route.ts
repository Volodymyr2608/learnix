import { getSession } from "@/server/better-auth/server";
import { courseAIService } from "@/server/services/courseAI.service";

export const runtime = "nodejs";

export async function POST(req: Request) {
	const session = await getSession();

	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { courseGenerationId, userMessage } = await req.json();

	if (!userMessage) {
		return new Response("Message is required", { status: 400 });
	}

	const abortSignal = req.signal;

	const courseGeneration = await courseAIService.getOrCreateCourseGeneration({
		courseGenerationId,
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

			const onAbort = () => {
				aborted = true;
				try {
					controller.close();
				} catch {}
			};

			abortSignal.addEventListener("abort", onAbort);

			try {
				send({ type: "start", courseGenerationId: courseGeneration.id });

				for await (const chunk of courseAIService.streamChatResponse({
					courseGeneration,
					userMessage,
					signal: abortSignal,
				})) {
					if (abortSignal.aborted) {
						aborted = true;
						break;
					}

					if (chunk.type === "token" && "value" in chunk) {
						assistantFullText += chunk.value;
					}
					send(chunk);
				}

				if (!aborted && assistantFullText) {
					await courseAIService.saveMessage(courseGeneration.id, {
						role: "assistant",
						content: assistantFullText,
					});

					send({ type: "done" });
				}
			} catch (e) {
				if (!abortSignal.aborted) {
					console.error("[Course AI stream error]", e);
					send({
						type: "error",
						message: "Failed to generate AI response",
					});
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
