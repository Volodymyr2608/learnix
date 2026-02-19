import type { Message } from "../types";

export const WELCOME_MESSAGE: Message = {
	id: "welcome",
	role: "assistant",
	content: `Hello! I'm your course creation assistant. Let's build your course together, step by step.\n\nFirst, tell me: What topic would you like to teach? What's your course about?`,
	suggestions: [
		"Web Development with React",
		"Data Science Fundamentals",
		"Digital Marketing Mastery",
		"UI/UX Design Principles",
	],
};
