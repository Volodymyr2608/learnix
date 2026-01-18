export interface CourseData {
	title: string;
	subtitle: string;
	description: string;
	category: string;
	level: string;
	language: string;
	duration: string;
	price: string;
	objectives: string[];
	requirements: string[];
	curriculum: {
		id: number;
		title: string;
		lessons: { id: number; title: string; duration: string }[];
	}[];
}

export interface Message {
	id: string;
	role: "assistant" | "user";
	content: string;
	isStreaming?: boolean;
	suggestions?: string[];
	showActions?: boolean;
	blockType?: "basic" | "objectives" | "requirements" | "curriculum";
}

export interface AIChatBuilderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApply: (data: CourseData) => void;
}
