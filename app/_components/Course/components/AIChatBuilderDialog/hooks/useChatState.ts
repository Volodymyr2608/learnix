import { useCallback, useState } from "react";
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

	return {
		messages,
		setMessages,
		input,
		setInput,
		addMessage,
		updateMessage,
		resetChat,
	};
};
