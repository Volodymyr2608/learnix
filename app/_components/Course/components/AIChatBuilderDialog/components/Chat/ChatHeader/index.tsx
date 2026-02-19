import { Sparkles } from "lucide-react";
import ProgressSteps from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatHeader/components/ProgressSteps";
import type { ChatHeaderProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Chat/ChatHeader/types";

const ChatHeader = (props: ChatHeaderProps) => {
	return (
		<div className="border-b bg-muted/30 p-4">
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
					<Sparkles className="h-5 w-5 text-primary" />
				</div>
				<div>
					<h3 className="font-semibold">Course Builder Assistant</h3>
					<p className="text-muted-foreground text-sm">
						Building your course step by step
					</p>
				</div>
			</div>

			<ProgressSteps {...props} />
		</div>
	);
};

export default ChatHeader;
