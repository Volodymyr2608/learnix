"use client";

import { MessageSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { reportClientError } from "@/app/_components/ErrorBoundary/actions";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { api } from "@/trpc/client";
import type { MessageStudentButtonProps } from "./types";

export function MessageStudentButton({
	courseId,
	studentId,
}: MessageStudentButtonProps) {
	const router = useRouter();
	const route = usePathname();
	const open = api.message.getOrCreateConversation.useMutation({
		onSuccess: ({ conversationId }) =>
			router.push(INSTRUCTOR_URLS.messageThread(conversationId)),
		onError: (error) =>
			void reportClientError({
				errorClass: error.data?.code ?? "TRPCClientError",
				route,
			}),
	});

	return (
		<button
			className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
			disabled={open.isPending}
			onClick={() => open.mutate({ courseId, studentId })}
			type="button"
		>
			<MessageSquare className="h-4 w-4" />
			Message
		</button>
	);
}
