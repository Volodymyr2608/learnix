import { z } from "zod";
import { getSession } from "@/server/better-auth/server";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { checkAiRateLimit } from "@/server/services/_shared/aiLimits";
import { learningPathAIService } from "@/server/services/learningPathAI/learningPathAI.service";

export const runtime = "nodejs";

const LearningPathChatBodySchema = z.object({
	courseId: z.cuid(),
});

export async function POST(req: Request) {
	const session = await getSession();
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	if (!checkAiRateLimit(session.user.id, "learningPathAI")) {
		return new Response("Too Many Requests", { status: 429 });
	}

	const parsed = LearningPathChatBodySchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response("courseId is required", { status: 400 });
	}
	const { courseId } = parsed.data;

	const enrollment = await enrollmentRepository.findByStudentCourse(
		session.user.id,
		courseId,
	);
	if (!enrollment) {
		return new Response("Not enrolled", { status: 403 });
	}

	const abortSignal = req.signal;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (data: unknown) => {
				if (abortSignal.aborted) return;
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			const onAbort = () => {
				try {
					controller.close();
				} catch {}
			};
			abortSignal.addEventListener("abort", onAbort);

			try {
				// The enrollment's own courseId, not the request's: downstream reads
				// like listOrderedWithConcepts scope on courseId alone, so the value
				// they receive has to be the one that proved access.
				for await (const event of learningPathAIService.streamRegenerate(
					session.user.id,
					enrollment.courseId,
				)) {
					if (abortSignal.aborted) {
						break;
					}
					send(event);
				}
			} catch (e) {
				if (!abortSignal.aborted) {
					console.error("[Learning path stream error]", e);
					send({ type: "error", message: "Failed to generate learning path" });
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
