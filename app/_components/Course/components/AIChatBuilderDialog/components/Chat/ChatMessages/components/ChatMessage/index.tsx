import { Bot, Check, RefreshCw, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/app/_components/_shared/ui/button";
import type { ChatMessageProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatMessages/components/ChatMessage/types";
import { cn } from "@/lib/utils/cn";

const ChatMessage = ({
	message,
	onRegenerateBlock,
	isTyping,
	onSuggestionClick,
	onAcceptBlock,
	isLastMessage,
	countMessages,
}: ChatMessageProps) => {
	const isUser = message.role === "user";

	return (
		<div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
			{!isUser && (
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<Bot className="h-4 w-4 text-primary" />
				</div>
			)}

			<div className={cn("max-w-[80%]", { "order-first": isUser })}>
				<div
					className={cn("rounded-2xl bg-muted px-4 py-2.5", {
						"bg-primary text-primary-foreground": isUser,
					})}
				>
					<div className="prose prose-sm m-0 text-sm">
						{isUser ? (
							message.content
						) : (
							<ReactMarkdown>{message.content}</ReactMarkdown>
						)}
						{message.isStreaming && (
							<span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current" />
						)}
					</div>
				</div>

				{message.suggestions && !message.isStreaming && countMessages === 1 && (
					<div className="mt-2 flex flex-wrap gap-2">
						{message.suggestions.map((suggestion) => (
							<Button
								className="h-7 bg-transparent text-xs"
								disabled={isTyping}
								key={suggestion}
								onClick={() => onSuggestionClick(suggestion)}
								size="sm"
								variant="outline"
							>
								{suggestion}
							</Button>
						))}
					</div>
				)}

				{/* Action Buttons */}
				{message.showActions &&
					!message.isStreaming &&
					message.step &&
					isLastMessage && (
						<div className="mt-2 flex gap-2">
							<Button
								className="h-8"
								disabled={isTyping}
								onClick={() =>
									message.step ? onAcceptBlock(message.step) : undefined
								}
								size="sm"
							>
								<Check className="mr-1.5 h-3.5 w-3.5" />
								Accept
							</Button>
							<Button
								className="h-8 bg-transparent"
								disabled={isTyping}
								onClick={() =>
									message.step ? onRegenerateBlock(message.step) : undefined
								}
								size="sm"
								variant="outline"
							>
								<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
								Regenerate
							</Button>
						</div>
					)}
			</div>

			{isUser && (
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
					<User className="h-4 w-4" />
				</div>
			)}
		</div>
	);
};

export default ChatMessage;
