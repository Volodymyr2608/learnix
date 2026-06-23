import { z } from "zod";

export const sendMessageInput = z.object({
	conversationId: z.string().min(1),
	body: z.string().trim().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

export const getThreadInput = z.object({
	conversationId: z.string().min(1),
	cursor: z.string().optional(),
});
export type GetThreadInput = z.infer<typeof getThreadInput>;

export const getOrCreateConversationInput = z.object({
	courseId: z.string().min(1),
	studentId: z.string().min(1).optional(),
});
export type GetOrCreateConversationInput = z.infer<
	typeof getOrCreateConversationInput
>;

export type ConversationSummary = {
	id: string;
	courseId: string;
	courseTitle: string;
	otherParticipantName: string;
	lastMessagePreview: string;
	lastMessageAt: string; // ISO
	unreadCount: number;
};

export type ThreadMessage = {
	id: string;
	body: string;
	senderId: string;
	isMine: boolean;
	createdAt: string; // ISO
};

export type ThreadView = {
	conversationId: string;
	otherParticipantName: string;
	courseTitle: string;
	messages: ThreadMessage[]; // oldest → newest
	nextCursor: string | null;
};
