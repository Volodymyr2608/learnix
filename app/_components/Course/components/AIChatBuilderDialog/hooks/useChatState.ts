import { useCallback, useState } from "react";
import { WELCOME_MESSAGE } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/welcomeMessage";
import type { CourseGenerationMessage } from "@/prisma/zod";
import type { Message } from "../types";

export const useChatState = () => {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");

	const addMessage = useCallback((message: Message) => {
		setMessages((prev) => [...prev, message]);
	}, []);

	const updateMessage = useCallback(
		(id: string, updater: (m: Message) => Message) => {
			setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
		},
		[],
	);

	const resetChat = useCallback(() => {
		setMessages([]);
		setInput("");
	}, []);

	const initializeMessages = useCallback(
		(initialMessages: CourseGenerationMessage[] = []) => {
			const adaptedMessages: Message[] = initialMessages.map((message) => ({
				id: message.id,
				role: message.role,
				content: message.content,
			}));

			setMessages([WELCOME_MESSAGE, ...adaptedMessages]);
		},
		[],
	);

	return {
		messages,
		setMessages,
		input,
		setInput,
		addMessage,
		updateMessage,
		resetChat,
		initializeMessages,
	};
};
