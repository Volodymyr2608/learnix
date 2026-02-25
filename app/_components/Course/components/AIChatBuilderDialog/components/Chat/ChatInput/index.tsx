import { Send } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import type { ChatInputProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatInput/types";

const ChatInput = ({
	value,
	isTyping,
	onInputChange,
	onSend,
}: ChatInputProps) => {
	const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		onSend();
	};

	return (
		<div className="shrink-0 border-t bg-background p-4">
			<form className="flex items-end gap-2" onSubmit={onSubmit}>
				<Textarea
					className="block max-h-40 min-h-10 w-full resize-none"
					onChange={(e) => onInputChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							onSend();
						}
					}}
					placeholder="Type your message or request changes..."
					value={value}
				/>
				<Button disabled={!value.trim() || isTyping} type="submit">
					<Send className="h-4 w-4" />
				</Button>
			</form>
			<p className="mt-2 text-muted-foreground text-xs">
				You can ask to modify any part of the course or continue with
				suggestions
			</p>
		</div>
	);
};

export default ChatInput;
