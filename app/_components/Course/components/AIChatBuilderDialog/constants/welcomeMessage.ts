import type { Message } from "../types";

export const WELCOME_MESSAGE: Message = {
	id: "welcome",
	role: "assistant",
	content:
		"Hello! I'm your course creation assistant...\n\nWhat topic would you like to teach?",
	suggestions: [
		"Web Development with React",
		"Data Science Fundamentals",
		"Digital Marketing Mastery",
		"UI/UX Design Principles",
	],
};
