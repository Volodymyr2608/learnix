"use client";

import { Button } from "app/_components/_shared/ui/button";
import { ScrollArea } from "app/_components/_shared/ui/scroll-area";
import { Textarea } from "app/_components/_shared/ui/textarea";
import { Bot, Send, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import Markdown from "react-markdown";
import { useLessonAssistant } from "./hooks/useLessonAssistant";

export function LessonAssistant({ lessonId }: { lessonId: string }) {
	const { messages, isLoading, sendMessage, clearHistory, isClearingHistory } =
		useLessonAssistant(lessonId);
	const [input, setInput] = useState("");
	const bottomRef = useRef<HTMLDivElement>(null);

	const handleSend = async () => {
		if (!input.trim() || isLoading) return;
		const msg = input;
		setInput("");
		await sendMessage(msg);
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 font-medium text-sm">
					<Bot className="h-4 w-4" />
					AI Lesson Assistant
				</div>
				{messages.length > 0 && (
					<Button
						disabled={isClearingHistory}
						onClick={clearHistory}
						size="sm"
						variant="ghost"
					>
						<Trash2 className="mr-1 h-3 w-3" />
						Clear
					</Button>
				)}
			</div>

			<ScrollArea className="h-[400px] rounded-lg border p-4">
				{messages.length === 0 ? (
					<p className="py-8 text-center text-muted-foreground text-sm">
						Ask me anything about this lesson!
					</p>
				) : (
					<div className="space-y-4">
						{messages.map((msg) => (
							<div
								className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
								key={msg.id}
							>
								<div
									className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
										msg.role === "user"
											? "bg-primary text-primary-foreground"
											: "bg-muted"
									}`}
								>
									{msg.role === "assistant" ? (
										<div className="prose prose-sm dark:prose-invert max-w-none">
											<Markdown>{msg.content}</Markdown>
											{msg.isStreaming && (
												<span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
											)}
										</div>
									) : (
										msg.content
									)}
								</div>
							</div>
						))}
						<div ref={bottomRef} />
					</div>
				)}
			</ScrollArea>

			<div className="flex gap-2">
				<Textarea
					className="resize-none"
					disabled={isLoading}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Ask a question... (Enter to send, Shift+Enter for newline)"
					value={input}
				/>
				<Button
					className="self-end"
					disabled={isLoading || !input.trim()}
					onClick={() => void handleSend()}
					size="icon"
				>
					<Send className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
