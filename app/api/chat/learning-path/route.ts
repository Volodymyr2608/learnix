import { getSession } from "@/server/better-auth/server";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { learningPathAIService } from "@/server/services/learningPathAI/learningPathAI.service";

export const runtime = "nodejs";

export async function POST(req: Request) {
	const session = await getSession();
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { courseId } = await req.json();
	if (!courseId) {
		return new Response("courseId is required", { status: 400 });
	}

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

			let aborted = false;
			const onAbort = () => {
				aborted = true;
				try {
					controller.close();
				} catch {}
			};
			abortSignal.addEventListener("abort", onAbort);

			try {
				for await (const event of learningPathAIService.streamRegenerate(
					session.user.id,
					courseId,
				)) {
					if (abortSignal.aborted) {
						aborted = true;
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
