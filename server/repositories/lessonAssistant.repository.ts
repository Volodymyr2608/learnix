import { db } from "@/server/db";

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

	async saveMessage(
		lessonId: string,
		studentId: string,
		message: { role: string; content: string; toolCalls?: unknown },
	) {
		const convo = await this.getOrCreateConversation(lessonId, studentId);
		return db.lessonAssistantMessage.create({
			data: {
				conversationId: convo.id,
				role: message.role,
				content: message.content,
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
