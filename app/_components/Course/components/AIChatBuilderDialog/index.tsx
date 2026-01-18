"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/app/_components/_shared/ui/dialog";
import ChatPanel from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel";
import PreviewPanel from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewPanel";
import { initialCourseData } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/initialCourseData";
import { STEPS } from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";
import type {
	AIChatBuilderDialogProps,
	CourseData,
	Message,
} from "@/app/_components/Course/components/AIChatBuilderDialog/types";

const AIChatBuilderDialog = ({
	open,
	onOpenChange,
	onApply,
}: AIChatBuilderDialogProps) => {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [isTyping, setIsTyping] = useState(false);
	const [currentStep, setCurrentStep] = useState(0);
	const [courseData, setCourseData] = useState<CourseData>(initialCourseData);
	const [completedSteps, setCompletedSteps] = useState<string[]>([]);

	const startConversation = useCallback(() => {
		const welcomeMessage: Message = {
			id: "welcome",
			role: "assistant",
			content:
				"Hello! I'm your course creation assistant. Let's build your course together, step by step.\n\nFirst, tell me: What topic would you like to teach? What's your course about?",
			suggestions: [
				"Web Development with React",
				"Data Science Fundamentals",
				"Digital Marketing Mastery",
				"UI/UX Design Principles",
			],
		};
		setMessages([welcomeMessage]);
	}, []);

	useEffect(() => {
		if (open && messages.length === 0) {
			startConversation();
		}
	}, [open, startConversation, messages.length]);

	const simulateTyping = async (text: string, messageId: string) => {
		setIsTyping(true);
		let currentText = "";

		for (let i = 0; i < text.length; i++) {
			currentText += text[i];
			setMessages((prev) =>
				prev.map((m) =>
					m.id === messageId
						? { ...m, content: currentText, isStreaming: true }
						: m,
				),
			);
			await new Promise((r) => setTimeout(r, 15));
		}

		setMessages((prev) =>
			prev.map((m) => (m.id === messageId ? { ...m, isStreaming: false } : m)),
		);
		setIsTyping(false);
	};

	const handleSend = async () => {
		if (!input.trim() || isTyping) return;

		const userMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: input,
		};
		setMessages((prev) => [...prev, userMessage]);
		setInput("");

		// Process based on current step
		await processUserInput(input);
	};

	const handleSuggestionClick = async (suggestion: string) => {
		if (isTyping) return;

		const userMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: suggestion,
		};
		setMessages((prev) => [...prev, userMessage]);

		await processUserInput(suggestion);
	};

	const processUserInput = async (userInput: string) => {
		const messageId = (Date.now() + 1).toString();

		// Add empty assistant message
		setMessages((prev) => [
			...prev,
			{ id: messageId, role: "assistant", content: "", isStreaming: true },
		]);

		// Simulate processing delay
		await new Promise((r) => setTimeout(r, 800));

		if (currentStep === 0 && !completedSteps.includes("basic")) {
			// Generate basic info
			await generateBasicInfo(userInput, messageId);
		} else if (currentStep === 1 && !completedSteps.includes("objectives")) {
			// Generate objectives
			await generateObjectives(messageId);
		} else if (currentStep === 2 && !completedSteps.includes("requirements")) {
			// Generate requirements
			await generateRequirements(messageId);
		} else if (currentStep === 3 && !completedSteps.includes("curriculum")) {
			// Generate curriculum
			await generateCurriculum(messageId);
		} else {
			// Handle modifications
			await handleModification(userInput, messageId);
		}
	};

	const generateBasicInfo = async (topic: string, messageId: string) => {
		const mockBasicInfo = {
			title: `Complete ${topic} Masterclass`,
			subtitle: `Master ${topic} from beginner to advanced level with hands-on projects`,
			description: `This comprehensive course will take you from zero to hero in ${topic}. You'll learn through practical examples, real-world projects, and expert guidance. By the end of this course, you'll have the skills and confidence to apply ${topic} in your career or personal projects.`,
			category: "Development",
			level: "Intermediate",
			language: "English",
			duration: "12 hours",
			price: "49.99",
		};

		setCourseData((prev) => ({ ...prev, ...mockBasicInfo }));

		const response = `Great choice! I've created the basic information for your "${topic}" course.\n\nHere's what I've prepared:\n- Title: ${mockBasicInfo.title}\n- Level: ${mockBasicInfo.level}\n- Duration: ${mockBasicInfo.duration}\n\nTake a look at the preview on the right. Does this look good to you?`;

		await simulateTyping(response, messageId);

		setMessages((prev) =>
			prev.map((m) =>
				m.id === messageId
					? { ...m, showActions: true, blockType: "basic" }
					: m,
			),
		);
	};

	const generateObjectives = async (messageId: string) => {
		const mockObjectives = [
			"Understand core concepts and fundamental principles",
			"Build real-world projects from scratch",
			"Apply best practices and industry standards",
			"Debug and troubleshoot common issues",
			"Create a professional portfolio project",
		];

		setCourseData((prev) => ({ ...prev, objectives: mockObjectives }));

		const response = `I've created 5 learning objectives for your course:\n\n${mockObjectives.map((obj, i) => `${i + 1}. ${obj}`).join("\n")}\n\nThese objectives clearly define what students will achieve. Would you like to modify any of them?`;

		await simulateTyping(response, messageId);

		setMessages((prev) =>
			prev.map((m) =>
				m.id === messageId
					? { ...m, showActions: true, blockType: "objectives" }
					: m,
			),
		);
	};

	const generateRequirements = async (messageId: string) => {
		const mockRequirements = [
			"Basic computer skills and internet access",
			"No prior experience required - we start from scratch",
			"A willingness to learn and practice regularly",
		];

		setCourseData((prev) => ({ ...prev, requirements: mockRequirements }));

		const response = `Here are the prerequisites I've defined for your course:\n\n${mockRequirements.map((req, i) => `- ${req}`).join("\n")}\n\nI've kept the requirements accessible to attract more students. Want to adjust these?`;

		await simulateTyping(response, messageId);

		setMessages((prev) =>
			prev.map((m) =>
				m.id === messageId
					? { ...m, showActions: true, blockType: "requirements" }
					: m,
			),
		);
	};

	const generateCurriculum = async (messageId: string) => {
		const mockCurriculum = [
			{
				id: 1,
				title: "Getting Started",
				lessons: [
					{ id: 1, title: "Course Introduction", duration: "5 min" },
					{ id: 2, title: "Setting Up Your Environment", duration: "15 min" },
					{ id: 3, title: "Understanding the Basics", duration: "20 min" },
				],
			},
			{
				id: 2,
				title: "Core Concepts",
				lessons: [
					{ id: 4, title: "Fundamental Principles", duration: "25 min" },
					{ id: 5, title: "Working with Data", duration: "30 min" },
					{ id: 6, title: "Building Your First Project", duration: "45 min" },
				],
			},
			{
				id: 3,
				title: "Advanced Techniques",
				lessons: [
					{ id: 7, title: "Advanced Patterns", duration: "35 min" },
					{ id: 8, title: "Performance Optimization", duration: "25 min" },
					{ id: 9, title: "Real-world Applications", duration: "40 min" },
				],
			},
			{
				id: 4,
				title: "Final Project",
				lessons: [
					{ id: 10, title: "Project Planning", duration: "20 min" },
					{ id: 11, title: "Building the Project", duration: "60 min" },
					{ id: 12, title: "Course Wrap-up", duration: "10 min" },
				],
			},
		];

		setCourseData((prev) => ({ ...prev, curriculum: mockCurriculum }));

		const totalLessons = mockCurriculum.reduce(
			(acc, s) => acc + s.lessons.length,
			0,
		);
		const response = `I've structured your curriculum with ${mockCurriculum.length} sections and ${totalLessons} lessons:\n\n${mockCurriculum.map((s) => `${s.title} (${s.lessons.length} lessons)`).join("\n")}\n\nThe structure follows a logical progression from basics to advanced. How does this look?`;

		await simulateTyping(response, messageId);

		setMessages((prev) =>
			prev.map((m) =>
				m.id === messageId
					? { ...m, showActions: true, blockType: "curriculum" }
					: m,
			),
		);
	};

	const handleModification = async (userInput: string, messageId: string) => {
		const lowerInput = userInput.toLowerCase();

		if (lowerInput.includes("title") || lowerInput.includes("name")) {
			setCourseData((prev) => ({
				...prev,
				title:
					userInput
						.replace(/change title to|set title as|title:/gi, "")
						.trim() || prev.title,
			}));
			await simulateTyping(
				"I've updated the course title. Check the preview to see the changes!",
				messageId,
			);
		} else if (
			lowerInput.includes("add objective") ||
			lowerInput.includes("more objective")
		) {
			const newObjective =
				userInput
					.replace(/add objective|add an objective|new objective:/gi, "")
					.trim() || "New learning objective";
			setCourseData((prev) => ({
				...prev,
				objectives: [...prev.objectives, newObjective],
			}));
			await simulateTyping(
				`Added a new objective: "${newObjective}". You can see it in the preview.`,
				messageId,
			);
		} else if (
			lowerInput.includes("add section") ||
			lowerInput.includes("more section")
		) {
			const newSection = {
				id: Date.now(),
				title: "New Section",
				lessons: [{ id: Date.now(), title: "New Lesson", duration: "15 min" }],
			};
			setCourseData((prev) => ({
				...prev,
				curriculum: [...prev.curriculum, newSection],
			}));
			await simulateTyping(
				"I've added a new section to your curriculum. You can edit the details in the preview.",
				messageId,
			);
		} else {
			await simulateTyping(
				"I understand you want to make changes. You can tell me specifically what to modify, like:\n- 'Change the title to...'\n- 'Add an objective about...'\n- 'Add a new section'\n- 'Make the course more beginner-friendly'",
				messageId,
			);
		}
	};

	const handleAcceptBlock = async (blockType: string) => {
		setCompletedSteps((prev) => [...prev, blockType]);

		const nextStep = currentStep + 1;
		setCurrentStep(nextStep);

		if (nextStep < STEPS.length) {
			const messageId = Date.now().toString();
			setMessages((prev) => [
				...prev,
				{ id: messageId, role: "assistant", content: "", isStreaming: true },
			]);

			await new Promise((r) => setTimeout(r, 500));

			const stepMessages: Record<string, string> = {
				objectives:
					"Excellent! Now let's define what students will learn. I'll create clear learning objectives for your course.",
				requirements:
					"Perfect! Next, let's set the prerequisites. I'll suggest what students should know before taking your course.",
				curriculum:
					"Great! Now for the exciting part - let's build your course structure. I'll create sections and lessons.",
			};

			await simulateTyping(
				stepMessages[STEPS[nextStep].id] ||
					"Let's continue building your course.",
				messageId,
			);

			// Auto-generate next block
			await new Promise((r) => setTimeout(r, 800));
			const nextMessageId = (Date.now() + 1).toString();
			setMessages((prev) => [
				...prev,
				{
					id: nextMessageId,
					role: "assistant",
					content: "",
					isStreaming: true,
				},
			]);

			if (nextStep === 1) await generateObjectives(nextMessageId);
			else if (nextStep === 2) await generateRequirements(nextMessageId);
			else if (nextStep === 3) await generateCurriculum(nextMessageId);
		} else {
			// All steps complete
			const messageId = Date.now().toString();
			setMessages((prev) => [
				...prev,
				{ id: messageId, role: "assistant", content: "", isStreaming: true },
			]);
			await simulateTyping(
				"Your course draft is complete! You can review everything in the preview panel. When you're ready, click 'Apply to Form' to use this draft, or continue chatting to make adjustments.",
				messageId,
			);
		}
	};

	const handleRegenerateBlock = async (blockType: string) => {
		const messageId = Date.now().toString();
		setMessages((prev) => [
			...prev,
			{ id: messageId, role: "assistant", content: "", isStreaming: true },
		]);

		await simulateTyping(
			"Let me create a different version for you...",
			messageId,
		);

		await new Promise((r) => setTimeout(r, 600));

		const regenMessageId = (Date.now() + 1).toString();
		setMessages((prev) => [
			...prev,
			{ id: regenMessageId, role: "assistant", content: "", isStreaming: true },
		]);

		if (blockType === "basic")
			await generateBasicInfo(
				courseData.title.replace("Complete ", "").replace(" Masterclass", ""),
				regenMessageId,
			);
		else if (blockType === "objectives")
			await generateObjectives(regenMessageId);
		else if (blockType === "requirements")
			await generateRequirements(regenMessageId);
		else if (blockType === "curriculum")
			await generateCurriculum(regenMessageId);
	};

	const handleApply = () => {
		onApply(courseData);
		onOpenChange(false);
		// Reset state
		setMessages([]);
		setCurrentStep(0);
		setCompletedSteps([]);
		setCourseData(initialCourseData);
	};

	const handleClose = () => {
		onOpenChange(false);
		// Reset state
		setMessages([]);
		setCurrentStep(0);
		setCompletedSteps([]);
		setCourseData(initialCourseData);
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="h-[85vh] gap-0 overflow-hidden p-0 lg:max-w-6xl">
				<div className="flex h-full">
					<ChatPanel
						completedSteps={completedSteps}
						currentStep={currentStep}
						input={input}
						isTyping={isTyping}
						messages={messages}
						onAcceptBlock={handleAcceptBlock}
						onInputChange={setInput}
						onRegenerateBlock={handleRegenerateBlock}
						onSend={handleSend}
						onSuggestionClick={handleSuggestionClick}
					/>

					<PreviewPanel
						completedSteps={completedSteps}
						courseData={courseData}
						onApply={handleApply}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default AIChatBuilderDialog;
