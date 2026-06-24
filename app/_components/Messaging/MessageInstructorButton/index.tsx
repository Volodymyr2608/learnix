"use client";

import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/app/_components/_shared/ui/tooltip";
import { api } from "@/trpc/client";
import type { MessageInstructorButtonProps } from "./types";

export function MessageInstructorButton({
	courseId,
}: MessageInstructorButtonProps) {
	const router = useRouter();
	const open = api.message.getOrCreateConversation.useMutation({
		onSuccess: ({ conversationId }) =>
			router.push(`/dashboard/messages?c=${conversationId}`),
		onError: (error) => console.error("Failed to open conversation:", error),
	});

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					aria-label="Message instructor"
					disabled={open.isPending}
					onClick={() => open.mutate({ courseId })}
					size="icon-lg"
					type="button"
					variant="outline"
				>
					<MessageSquare className="h-5 w-5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>Message instructor</TooltipContent>
		</Tooltip>
	);
}
