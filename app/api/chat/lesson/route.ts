import { getSession } from "@/server/better-auth/server";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { guardUserInput } from "@/server/services/_shared/aiGuard/guardUserInput";
import { lessonAIService } from "@/server/services/lessonAI/lessonAI.service";
import {
	checkAiRateLimit,
	validateMessageLength,
} from "@/server/utils/aiRateLimiter";

export const runtime = "nodejs";

export async function POST(req: Request) {
	const session = await getSession();
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	if (!checkAiRateLimit(session.user.id)) {
		return new Response("Too Many Requests", { status: 429 });
	}

	const { lessonId, message } = await req.json();

	if (!lessonId || !message) {
		return new Response("lessonId and message are required", { status: 400 });
	}

	if (!validateMessageLength(message)) {
		return new Response("Message too long", { status: 413 });
	}

	const enrollment = await enrollmentRepository.findFirst({
		where: {
			studentId: session.user.id,
			course: {
				sections: { some: { lessons: { some: { id: lessonId } } } },
			},
		},
	});
	if (!enrollment) {
		return new Response("Not enrolled", { status: 403 });
	}

	const lesson = await lessonRepository.findFirst({
		where: { id: lessonId, deletedAt: null },
		include: { section: { include: { course: true } } },
	});
	if (!lesson) {
		return new Response("Lesson not found", { status: 404 });
	}

	const lessonWithSection = lesson as typeof lesson & {
		section: { courseId: string; course: { title: string } };
	};

	const courseTitle = lessonWithSection.section.course.title;

	const guard = await guardUserInput(message, {
		feature: "lessonAI",
		userId: session.user.id,
		domain: {
			description: `the course "${courseTitle}" and its lesson "${lesson.title}"`,
			subject: `the "${courseTitle}" course`,
		},
	});

	const oneShot = (event: Record<string, unknown>) =>
		new Response(
			new TextEncoder().encode(
				`data: ${JSON.stringify(event)}\n\n` +
					`data: ${JSON.stringify({ type: "done" })}\n\n`,
			),
			{
				headers: {
					"Content-Type": "text/event-stream; charset=utf-8",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					"X-Accel-Buffering": "no",
				},
			},
		);

	if (guard.outcome === "blocked") {
		// Persist NOTHING. A stored injection payload is replayed as trusted
		// HumanMessage history on the next turn, where no L3 wrapping applies —
		// which would silently defeat this block.
		return oneShot({ type: "guard_blocked", message: guard.message });
	}

	if (guard.outcome === "off_topic") {
		await lessonAssistantRepository.saveMessage(lessonId, session.user.id, {
			role: "user",
			content: message,
		});
		await lessonAssistantRepository.saveMessage(lessonId, session.user.id, {
			role: "assistant",
			content: guard.message ?? "",
		});
		return oneShot({ type: "off_topic", message: guard.message });
	}

	await lessonAssistantRepository.saveMessage(lessonId, session.user.id, {
		role: "user",
		content: message,
	});

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
				for await (const event of lessonAIService.streamResponse({
					lessonId,
					lessonTitle: lesson.title,
					courseTitle,
					courseId: lessonWithSection.section.courseId,
					studentId: session.user.id,
					userMessage: message,
					signal: abortSignal,
				})) {
					if (abortSignal.aborted) {
						aborted = true;
						break;
					}
					send(event);
				}

				if (!aborted) send({ type: "done" });
			} catch (e) {
				if (!abortSignal.aborted) {
					console.error("[Lesson AI stream error]", e);
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
