import type { Message, Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export type MessageNotificationData = {
	body: string;
	senderId: string;
	conversation: {
		id: string;
		studentId: string;
		instructorId: string;
		student: { name: string; email: string };
		instructor: { name: string; email: string };
		course: { title: string };
	};
};

export default class MessageRepository extends BaseRepository<
	"message",
	Message,
	Prisma.MessageUncheckedCreateInput,
	Prisma.MessageUpdateInput,
	Prisma.MessageWhereInput,
	Prisma.MessageInclude,
	Prisma.MessageSelect,
	Prisma.MessageOrderByWithRelationInput
> {
	protected readonly modelName = "message";

	createWithBump(
		conversationId: string,
		senderId: string,
		body: string,
	): Promise<Message> {
		return db.$transaction(async (tx) => {
			const message = await tx.message.create({
				data: { conversationId, senderId, body },
			});
			await tx.conversation.update({
				where: { id: conversationId },
				data: { lastMessageAt: message.createdAt },
			});
			return message;
		});
	}

	listByConversation(
		conversationId: string,
		limit: number,
		cursor?: string,
	): Promise<Message[]> {
		return this.model.findMany({
			where: {
				conversationId,
				...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
			},
			orderBy: { createdAt: "desc" },
			take: limit + 1,
		});
	}

	async markReadFor(conversationId: string, viewerId: string): Promise<number> {
		const result = await this.model.updateMany({
			where: { conversationId, readAt: null, NOT: { senderId: viewerId } },
			data: { readAt: new Date() },
		});
		return result.count;
	}

	getTotalUnreadForUser(userId: string): Promise<number> {
		return this.model.count({
			where: {
				readAt: null,
				NOT: { senderId: userId },
				conversation: {
					OR: [{ studentId: userId }, { instructorId: userId }],
				},
			},
		});
	}

	findForNotification(
		messageId: string,
	): Promise<MessageNotificationData | null> {
		return this.model.findUnique({
			where: { id: messageId },
			select: {
				body: true,
				senderId: true,
				conversation: {
					select: {
						id: true,
						studentId: true,
						instructorId: true,
						student: { select: { name: true, email: true } },
						instructor: { select: { name: true, email: true } },
						course: { select: { title: true } },
					},
				},
			},
		});
	}
}

export const messageRepository = new MessageRepository();
