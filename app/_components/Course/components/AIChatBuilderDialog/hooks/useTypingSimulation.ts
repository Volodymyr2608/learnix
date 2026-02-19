import { useState } from "react";
import type { Message } from "../types";

export const useTypingSimulation = (
	updateMessage: (id: string, updater: (m: Message) => Message) => void,
) => {
	const [isTyping, setIsTyping] = useState(false);

	const simulateTyping = async (text: string, messageId: string) => {
		setIsTyping(true);
		let buffer = "";

		const chunkSize = 2;
		for (let i = 0; i < text.length; i += chunkSize) {
			buffer += text.slice(i, i + chunkSize);

			updateMessage(messageId, (m) => ({
				...m,
				content: buffer,
				isStreaming: true,
			}));

			await new Promise((r) => setTimeout(r, Math.random() * 10 + 1));
		}

		updateMessage(messageId, (m) => ({ ...m, isStreaming: false }));

		setIsTyping(false);
	};

	return { isTyping, simulateTyping };
};
