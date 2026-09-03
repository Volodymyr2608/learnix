import { z } from "zod";
import { EnrollmentStatus } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { parseStoredConcepts } from "@/server/repositories/lessonInsights.conceptsSchema";
import { guardUserInput } from "@/server/services/_shared/aiGuard/guardUserInput";
import {
	checkAiRateLimit,
	validateMessageLength,
} from "@/server/services/_shared/aiLimits";
import { aiMetricsHandler } from "@/server/services/_shared/aiMetrics/handler";
import { lessonConceptNames } from "@/server/services/_shared/concepts/lessonConcepts";
import { lessonGuardDomain } from "@/server/services/lessonAI/guardDomain";
import { lessonAIService } from "@/server/services/lessonAI/lessonAI.service";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";

const LessonChatBodySchema = z.object({
	lessonId: z.cuid(),
	message: z.string().min(1),
});

export async function POST(req: Request) {
	const session = await getSession();
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	if (!(await checkAiRateLimit(session.user.id, "lessonAI"))) {
		return new Response("Too Many Requests", { status: 429 });
	}

	const parsed = LessonChatBodySchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response("lessonId and message are required", { status: 400 });
	}
	const { lessonId, message } = parsed.data;

	if (!validateMessageLength(message)) {
		return new Response("Message too long", { status: 413 });
	}

	const enrollment = await enrollmentRepository.findFirst({
		where: {
			studentId: session.user.id,
			// Access must reflect *current* entitlement: an unenrolled or refunded
			// student keeping tutor access is a paywall bypass at our model-cost.
			status: { not: EnrollmentStatus.cancelled },
			course: {
				sections: { some: { lessons: { some: { id: lessonId } } } },
			},
		},
		select: {
			courseId: true,
			course: {
				select: {
					title: true,
					sections: {
						where: { lessons: { some: { id: lessonId } } },
						select: {
							lessons: {
								where: { id: lessonId, deletedAt: null },
								select: {
									id: true,
									title: true,
									// Joined here rather than fetched after: the concepts scope
									// the relevance guard, and the guard runs before anything
									// else, so a second query would be a round trip on every
									// turn. It also keeps ADR-023 intact — these come back from
									// the statement that proved enrollment, not from a lookup
									// keyed by an id the request supplied.
									lessonInsights: { select: { concepts: true } },
								},
							},
						},
					},
				},
			},
		},
	});
	if (!enrollment) {
		return new Response("Not enrolled", { status: 403 });
	}

	// Read out of the row that proved access rather than fetched again by the
	// request's own id: the query that authorizes and the query that acts are the
	// same one, so they cannot resolve to different courses.
	const lesson = enrollment.course.sections.flatMap((s) => s.lessons)[0];
	if (!lesson) {
		return new Response("Lesson not found", { status: 404 });
	}

	const courseTitle = enrollment.course.title;

	// Built BEFORE the guard: L2 is a model call on every turn, so a handler
	// created later would omit it from the turn's cost and start the latency
	// clock after a wait the student already spent (up to L2's 3s budget).
	// It is also what lets a guard-blocked turn report a summary at all — those
	// paths return below without ever reaching the service.
	const metrics = aiMetricsHandler({ feature: "lessonAI" });

	const guard = await guardUserInput(message, {
		feature: "lessonAI",
		userId: session.user.id,
		metrics,
		// The lesson's concepts are part of what counts as on-topic. Without them
		// a student naming one — the phrasing the tutor's own prompt invites for a
		// concept check — was refused as a different subject before the tutor ever
		// saw it. See ai-input-trust-boundary/spec.md, scope item 12.
		domain: lessonGuardDomain({
			courseTitle,
			lessonTitle: lesson.title,
			// Through the SAME parse the tutor service uses. Reading the raw column
			// here made the two disagree on a partly-malformed row: the guard would
			// admit "check my understanding of API Routes" while `toolPolicy`, whose
			// allowlist comes back empty from the all-or-nothing parse, declined the
			// check one layer later. The student passes the gate and is refused
			// anyway — the silent mismatch this whole item exists to remove.
			concepts: lessonConceptNames(
				parseStoredConcepts(lesson.lessonInsights?.concepts, { lessonId }),
			),
		}),
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
		// A blocked turn still happened, and still cost an L2 call. Dropping it
		// would take blocked turns out of the denominator of every rate computed
		// from these lines — spec.md Edge cases.
		metrics.emitSummary("ok");
		// Persist NOTHING. A stored injection payload is replayed as trusted
		// HumanMessage history on the next turn, where no L3 wrapping applies —
		// which would silently defeat this block.
		return oneShot({ type: "guard_blocked", message: guard.message });
	}

	if (guard.outcome === "off_topic") {
		metrics.emitSummary("ok");
		// Both rows persist so the refusal survives a reload — but neither returns
		// to the model. A rejected turn replayed as trusted HumanMessage history
		// would turn L2's refusal into a delivery mechanism instead of a boundary.
		await lessonAssistantRepository.saveMessage(lessonId, session.user.id, {
			role: "user",
			content: message,
			contextEligible: false,
		});
		await lessonAssistantRepository.saveMessage(lessonId, session.user.id, {
			role: "assistant",
			content: guard.message ?? "",
			contextEligible: false,
		});
		return oneShot({ type: "off_topic", message: guard.message });
	}

	// The user turn is persisted by lessonAIService.streamResponse, after it reads
	// the model context — saving it here would put this turn into its own replayed
	// history and then append it again as the current message.
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
					courseId: enrollment.courseId,
					studentId: session.user.id,
					userMessage: message,
					signal: abortSignal,
					metrics,
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
					logger.error("[Lesson AI stream error]", e);
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
