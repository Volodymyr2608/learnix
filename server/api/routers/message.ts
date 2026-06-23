import { z } from "zod";
import type { Role } from "@/generated/prisma";
import {
	getOrCreateConversationInput,
	getThreadInput,
	sendMessageInput,
} from "@/server/entities/messaging/messaging.dto";
import { messagingService } from "@/server/services/messaging/messaging.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const messageRouter = createTRPCRouter({
	listConversations: protectedProcedure.query(async ({ ctx }) => {
		try {
			return await messagingService.listConversations(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
		try {
			return await messagingService.getUnreadCount(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getOrCreateConversation: protectedProcedure
		.input(getOrCreateConversationInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await messagingService.getOrCreateConversation(
					{ id: ctx.session.user.id, role: ctx.session.user.role as Role },
					input,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getThread: protectedProcedure
		.input(getThreadInput)
		.query(async ({ ctx, input }) => {
			try {
				return await messagingService.getThread(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	markRead: protectedProcedure
		.input(z.object({ conversationId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await messagingService.markRead(
					ctx.session.user.id,
					input.conversationId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	send: protectedProcedure
		.input(sendMessageInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await messagingService.send(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
