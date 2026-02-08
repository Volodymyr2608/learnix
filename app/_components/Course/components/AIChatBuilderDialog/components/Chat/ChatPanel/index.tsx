import ChatHeader from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatHeader";
import ChatInput from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatInput";
import ChatMessages from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatMessages";
import type { ChatPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel/types";

const ChatPanel = ({
	messages,
	onSend,
	completedSteps,
	onSuggestionClick,
	onRegenerateBlock,
	currentStep,
	input,
	isTyping,
	onAcceptBlock,
	onInputChange,
}: ChatPanelProps) => {
	return (
		<div className="flex flex-1 flex-col border-r">
			<ChatHeader completedSteps={completedSteps} currentStep={currentStep} />

			<ChatMessages
				isTyping={isTyping}
				messages={messages}
				onAcceptBlock={onAcceptBlock}
				onRegenerateBlock={onRegenerateBlock}
				onSuggestionClick={onSuggestionClick}
			/>

			<ChatInput
				isTyping={isTyping}
				onInputChange={onInputChange}
				onSend={onSend}
				value={input}
			/>
		</div>
	);
};

export default ChatPanel;
