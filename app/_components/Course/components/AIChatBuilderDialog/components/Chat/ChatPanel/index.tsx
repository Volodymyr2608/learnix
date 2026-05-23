import ChatHeader from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatHeader";
import ChatInput from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatInput";
import ChatMessages from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatMessages";
import type { ChatPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatPanel/types";
import { ConfidenceBadge } from "../ConfidenceBadge";
import { ToolCallIndicator } from "../ToolCallIndicator";

const ChatPanel = ({
	messages,
	onSend,
	completedSteps,
	onSuggestionClick,
	currentStep,
	input,
	isTyping,
	onAcceptBlock,
	onInputChange,
	activeToolCall,
	lastAutoAdvanced,
	lastConfidence,
	showAcceptButton,
}: ChatPanelProps) => {
	return (
		<div className="flex flex-1 flex-col border-r">
			<ChatHeader completedSteps={completedSteps} currentStep={currentStep} />

			<ChatMessages
				isTyping={isTyping}
				lastAutoAdvanced={lastAutoAdvanced}
				messages={messages}
				onAcceptBlock={onAcceptBlock}
				onSuggestionClick={onSuggestionClick}
				showAcceptButton={showAcceptButton}
			/>

			{activeToolCall && (
				<div className="px-4 py-1">
					<ToolCallIndicator name={activeToolCall} />
				</div>
			)}
			{lastConfidence !== null && lastConfidence !== undefined && (
				<div className="px-4 py-1">
					<ConfidenceBadge value={lastConfidence} />
				</div>
			)}

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
