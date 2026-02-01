import type { Message } from "../types";

export const createUserMessage = (content: string): Message => ({
	id: crypto.randomUUID(),
	role: "user",
	content,
});

export const createAssistantMessage = (
	overrides?: Partial<Message>,
): Message => ({
	id: crypto.randomUUID(),
	role: "assistant",
	content: "",
	isStreaming: true,
	...overrides,
});
