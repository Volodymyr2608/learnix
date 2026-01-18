import { Send } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Input } from "@/app/_components/_shared/ui/input";
import type { ChatInputProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatInput/types";

const ChatInput = ({
	value,
	isTyping,
	onInputChange,
	onSend,
}: ChatInputProps) => {
	const inputRef = useRef<HTMLInputElement | null>(null);

	const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		onSend();
	};

	return (
		<div className="border-t bg-background p-4">
			<form className="flex gap-2" onSubmit={onSubmit}>
				<Input
					className="flex-1"
					disabled={isTyping}
					onChange={(e) => onInputChange(e.target.value)}
					placeholder="Type your message or request changes..."
					ref={inputRef}
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
