"use client";

import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";

import type { ChooseChatDialogProps } from "./types";

export const ChooseChatDialog = ({
	open,
	onOpenChange,
	onNewChatHandler,
	onContinueHandler,
}: ChooseChatDialogProps) => {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="text-balance">AI Assistant</DialogTitle>
					<DialogDescription>
						Would you like to continue your previous conversation or start a new
						one?
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="sm:justify-center">
					<Button
						className="flex-1"
						onClick={onContinueHandler}
						variant="outline"
					>
						<MessageSquare className="h-6 w-6" />
						Continue
					</Button>
					<Button className="flex-1" onClick={onNewChatHandler}>
						<Plus className="h-6 w-6" />
						New Chat
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
