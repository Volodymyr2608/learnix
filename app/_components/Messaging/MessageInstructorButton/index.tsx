"use client";

import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
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
		<button
			className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
			disabled={open.isPending}
			onClick={() => open.mutate({ courseId })}
			type="button"
		>
			<MessageSquare className="h-4 w-4" />
			Message instructor
		</button>
	);
}
