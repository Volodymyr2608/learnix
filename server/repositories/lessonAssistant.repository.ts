import { db } from "@/server/db";

/**
 * Most-recent turns sent to the model. Bounds cost and latency the student
 * controls, and keeps the system prompt from being diluted as the conversation
 * grows — a guard that lives in the prompt weakens as its share of the context
 * shrinks.
 */
const MODEL_CONTEXT_MESSAGE_LIMIT = 20;

/**
 * The message count bounds neither of the things the limit above exists for.
 * Twenty turns at the 2,000-character input cap is ~40 KB, so a student writing
 * long messages gets 20× the prompt dilution of one writing short ones — exactly
 * backwards. Trimming is by WHOLE messages: a truncated turn is a new injection
 * primitive, not a saving.
 */
const MODEL_CONTEXT_CHAR_BUDGET = 8_000;

class LessonAssistantRepository {
	private async getOrCreateConversation(lessonId: string, studentId: string) {
		return db.lessonAssistantConversation.upsert({
			where: { lessonId_studentId: { lessonId, studentId } },
			create: { lessonId, studentId },
			update: {},
		});
	}

	async getMessages(lessonId: string, studentId: string) {
		const convo = await db.lessonAssistantConversation.findUnique({
			where: { lessonId_studentId: { lessonId, studentId } },
			include: { messages: { orderBy: { createdAt: "asc" } } },
		});
		return convo?.messages ?? [];
	}

	/**
	 * The model-context read. Separate from getMessages on purpose: the thread
	 * read serves the UI and must show everything, including turns the guard
	 * rejected; this one must show neither those nor an unbounded history.
	 */
	async getContextMessages(
		lessonId: string,
		studentId: string,
		limit: number = MODEL_CONTEXT_MESSAGE_LIMIT,
	) {
		const convo = await db.lessonAssistantConversation.findUnique({
			where: { lessonId_studentId: { lessonId, studentId } },
			select: { id: true },
		});
		if (!convo) return [];

		// Newest-first with `take`, then reversed: `orderBy asc` + `take` would
		// return the OLDEST N, which is the opposite of a recency window.
		const rows = await db.lessonAssistantMessage.findMany({
			where: { conversationId: convo.id, contextEligible: true },
			// createdAt is timestamp(3), so two rows written in the same millisecond
			// tie; without the id tiebreaker a user/assistant pair could invert or
			// a boundary row could flip in and out of the window.
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: limit,
		});

		// rows is newest-first here; keep taking while the budget allows, then flip
		// back to chronological order. The length guard keeps one message even when
		// it alone busts the budget — an empty context is worse than an oversized one.
		const kept: typeof rows = [];
		let used = 0;
		for (const row of rows) {
			if (
				kept.length > 0 &&
				used + row.content.length > MODEL_CONTEXT_CHAR_BUDGET
			) {
				break;
			}
			kept.push(row);
			used += row.content.length;
		}
		return kept.reverse();
	}

	async saveMessage(
		lessonId: string,
		studentId: string,
		message: {
			role: string;
			content: string;
			toolCalls?: unknown;
			contextEligible?: boolean;
		},
	) {
		const convo = await this.getOrCreateConversation(lessonId, studentId);
		return db.lessonAssistantMessage.create({
			data: {
				conversationId: convo.id,
				role: message.role,
				content: message.content,
				contextEligible: message.contextEligible ?? true,
				toolCalls:
					message.toolCalls !== undefined
						? (message.toolCalls as object)
						: undefined,
			},
		});
	}

	/**
	 * Takes a message out of the model-context read while leaving it in the thread.
	 * Used when the OUTPUT boundary rejects a reply: the prompt that elicited it is
	 * the strongest adversarial signal available, and replaying it as ordinary
	 * history hands the payload a fresh sample of a stochastic model on every retry.
	 *
	 * Scoped by conversation even though the only caller passes a server-minted id
	 * from the same request: ownership belongs in the query that acts, not in the
	 * discipline of one call site (ADR-017 Rule 2). `updateMany` also makes a
	 * vanished row a no-op instead of a P2025 throw — the row really can vanish,
	 * because `clearHistory` is callable while a turn is still streaming.
	 */
	async markContextIneligible(
		messageId: string,
		lessonId: string,
		studentId: string,
	) {
		await db.lessonAssistantMessage.updateMany({
			where: { id: messageId, conversation: { lessonId, studentId } },
			data: { contextEligible: false },
		});
	}

	async clearMessages(lessonId: string, studentId: string) {
		const convo = await db.lessonAssistantConversation.findUnique({
			where: { lessonId_studentId: { lessonId, studentId } },
		});
		if (!convo) return;
		await db.lessonAssistantMessage.deleteMany({
			where: { conversationId: convo.id },
		});
	}
}

export const lessonAssistantRepository = new LessonAssistantRepository();
