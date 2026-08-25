"use client";

import { MessageSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/app/_components/_shared/ui/tooltip";
import { reportClientError } from "@/app/_components/ErrorBoundary/actions";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { api } from "@/trpc/client";
import type { MessageInstructorButtonProps } from "./types";

export function MessageInstructorButton({
	courseId,
}: MessageInstructorButtonProps) {
	const router = useRouter();
	const route = usePathname();
	const open = api.message.getOrCreateConversation.useMutation({
		onSuccess: ({ conversationId }) =>
			router.push(STUDENT_URLS.messageThread(conversationId)),
		onError: (error) =>
			void reportClientError({
				errorClass: error.data?.code ?? "TRPCClientError",
				route,
			}),
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
