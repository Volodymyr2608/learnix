import { Role } from "@/generated/prisma";
import type {
	ConversationSummary,
	GetOrCreateConversationInput,
	GetThreadInput,
	SendMessageInput,
	ThreadView,
} from "@/server/entities/messaging/messaging.dto";
import { conversationRepository } from "@/server/repositories/conversation.repository";
import { courseRepository } from "@/server/repositories/course.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { messageRepository } from "@/server/repositories/message.repository";
import { MessagingError } from "@/server/services/messaging/messaging.errors";
import { notificationService } from "@/server/services/notifications/notification.service";
import { logger } from "@/server/utils/logger";

const PAGE_SIZE = 30;

class MessagingService {
	async getOrCreateConversation(
		caller: { id: string; role: Role },
		input: GetOrCreateConversationInput,
	): Promise<{ conversationId: string }> {
		const course = await courseRepository.findFirst({
			where: { id: input.courseId, deletedAt: null },
			select: { id: true, instructorId: true },
		});
		if (!course) {
			throw new MessagingError("Course not found", "NOT_FOUND");
		}

		let studentId: string;
		const instructorId = course.instructorId;
		if (caller.role === Role.STUDENT) {
			studentId = caller.id;
		} else if (caller.role === Role.INSTRUCTOR) {
			if (course.instructorId !== caller.id) {
				throw new MessagingError("Not your course", "FORBIDDEN");
			}
			if (!input.studentId) {
				throw new MessagingError("studentId is required", "BAD_REQUEST");
			}
			studentId = input.studentId;
		} else {
			throw new MessagingError("Not allowed", "FORBIDDEN");
		}

		const enrollment = await enrollmentRepository.findByStudentCourse(
			studentId,
			input.courseId,
		);
		if (!enrollment) {
			throw new MessagingError(
				"Forbidden: student is not enrolled in this course",
				"FORBIDDEN",
			);
		}

		const conversation = await conversationRepository.getOrCreate(
			studentId,
			instructorId,
			input.courseId,
		);
		return { conversationId: conversation.id };
	}

	async listConversations(userId: string): Promise<ConversationSummary[]> {
		const rows = await conversationRepository.findForUser(userId);
		return rows.map((r) => ({
			id: r.id,
			courseId: r.courseId,
			courseTitle: r.courseTitle,
			otherParticipantName: r.otherParticipantName,
			lastMessagePreview: r.lastMessagePreview,
			lastMessageAt: r.lastMessageAt.toISOString(),
			unreadCount: r.unreadCount,
		}));
	}

	async getThread(userId: string, input: GetThreadInput): Promise<ThreadView> {
		const convo = await this.assertParticipant(input.conversationId, userId);
		const rows = await messageRepository.listByConversation(
			convo.id,
			PAGE_SIZE,
			input.cursor,
		);
		const hasMore = rows.length > PAGE_SIZE;
		const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
		const nextCursor = hasMore
			? (page.at(-1)?.createdAt.toISOString() ?? null)
			: null;
		const ascending = [...page].reverse();

		return {
			conversationId: convo.id,
			otherParticipantName:
				userId === convo.studentId ? convo.instructorName : convo.studentName,
			courseTitle: convo.courseTitle,
			messages: ascending.map((m) => ({
				id: m.id,
				body: m.body,
				senderId: m.senderId,
				isMine: m.senderId === userId,
				createdAt: m.createdAt.toISOString(),
			})),
			nextCursor,
		};
	}

	async markRead(
		userId: string,
		conversationId: string,
	): Promise<{ updated: number }> {
		await this.assertParticipant(conversationId, userId);
		const updated = await messageRepository.markReadFor(conversationId, userId);
		return { updated };
	}

	async send(
		userId: string,
		input: SendMessageInput,
	): Promise<{ id: string; createdAt: string }> {
		await this.assertParticipant(input.conversationId, userId);
		const message = await messageRepository.createWithBump(
			input.conversationId,
			userId,
			input.body,
		);
		notificationService
			.fireNewMessage(message.id)
			.catch((error) =>
				logger.warn("Failed to send new-message email", { error }),
			);
		return { id: message.id, createdAt: message.createdAt.toISOString() };
	}

	getUnreadCount(userId: string): Promise<number> {
		return messageRepository.getTotalUnreadForUser(userId);
	}

	private async assertParticipant(conversationId: string, userId: string) {
		const convo =
			await conversationRepository.findWithParticipants(conversationId);
		if (!convo) {
			throw new MessagingError("Conversation not found", "NOT_FOUND");
		}
		if (convo.studentId !== userId && convo.instructorId !== userId) {
			throw new MessagingError("Forbidden: not a participant", "FORBIDDEN");
		}
		return convo;
	}
}

export const messagingService = new MessagingService();
