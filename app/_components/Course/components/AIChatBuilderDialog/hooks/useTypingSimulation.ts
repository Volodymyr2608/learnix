import { useState } from "react";
import type { Message } from "../types";

export const useTypingSimulation = (
	updateMessage: (id: string, updater: (m: Message) => Message) => void,
) => {
	const [isTyping, setIsTyping] = useState(false);

	const simulateTyping = async (text: string, messageId: string) => {
		setIsTyping(true);
		let buffer = "";

		for (const char of text) {
			buffer += char;
			updateMessage(messageId, (m) => ({
				...m,
				content: buffer,
				isStreaming: true,
			}));

			await new Promise((r) => setTimeout(r, 15));
		}

		updateMessage(messageId, (m) => ({ ...m, isStreaming: false }));

		setIsTyping(false);
	};

	return { isTyping, simulateTyping };
};
