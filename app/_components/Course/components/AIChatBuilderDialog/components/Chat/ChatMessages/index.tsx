import { Bot } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/app/_components/_shared/ui/scroll-area";
import ChatMessage from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatMessages/components/ChatMessage";
import type { ChatMessagesProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatMessages/types";

const ChatMessages = ({ messages, isTyping, ...props }: ChatMessagesProps) => {
	const scrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (messages.length === 0) return;
		// Use setTimeout to ensure DOM has updated before scrolling
		const timer = setTimeout(() => {
			if (scrollRef.current) {
				scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
			}
		}, 50);
		return () => clearTimeout(timer);
	}, [messages]);

	return (
		<ScrollArea className="max-h-[calc(85vh-220px)] flex-1 overflow-y-auto p-4">
			<div className="space-y-4">
				{messages.map((message, index) => (
					<ChatMessage
						isLastMessage={index === messages.length - 1}
						isTyping={isTyping}
						key={message.id}
						message={message}
						{...props}
					/>
				))}

				{isTyping && messages[messages.length - 1]?.role !== "assistant" && (
					<div className="flex gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
							<Bot className="h-4 w-4 text-primary" />
						</div>
						<div className="rounded-2xl bg-muted px-4 py-2.5">
							<div className="flex gap-1">
								<span
									className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
									style={{ animationDelay: "0ms" }}
								/>
								<span
									className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
									style={{ animationDelay: "150ms" }}
								/>
								<span
									className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
									style={{ animationDelay: "300ms" }}
								/>
							</div>
						</div>
					</div>
				)}
				<div ref={scrollRef} />
			</div>
		</ScrollArea>
	);
};

export default ChatMessages;
