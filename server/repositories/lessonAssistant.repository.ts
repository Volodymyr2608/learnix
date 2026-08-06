import { db } from "@/server/db";

/**
 * Most-recent turns sent to the model. Bounds cost and latency the student
 * controls, and keeps the system prompt from being diluted as the conversation
 * grows — a guard that lives in the prompt weakens as its share of the context
 * shrinks.
 */
const MODEL_CONTEXT_MESSAGE_LIMIT = 20;

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
			orderBy: { createdAt: "desc" },
			take: limit,
		});
		return rows.reverse();
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
