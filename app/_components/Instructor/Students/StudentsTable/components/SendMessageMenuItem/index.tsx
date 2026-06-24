"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/app/_components/_shared/ui/dropdown-menu";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { api } from "@/trpc/client";
import { truncateTitle } from "../../helpers/truncateTitle";
import type { SendMessageMenuItemProps } from "./types";

export function SendMessageMenuItem({
	studentId,
	courses,
}: SendMessageMenuItemProps) {
	const router = useRouter();
	const open = api.message.getOrCreateConversation.useMutation({
		onSuccess: ({ conversationId }) =>
			router.push(INSTRUCTOR_URLS.messageThread(conversationId)),
		onError: (error) => console.error("Failed to open conversation:", error),
	});

	const message = (courseId: string) => open.mutate({ courseId, studentId });

	const [firstCourse, ...rest] = courses;

	// Every student in the table is enrolled, but guard defensively.
	if (!firstCourse) {
		return (
			<DropdownMenuItem disabled>
				<Mail className="mr-2 h-4 w-4" />
				Send Message
			</DropdownMenuItem>
		);
	}

	// Single shared course → message directly, no submenu.
	if (rest.length === 0) {
		return (
			<DropdownMenuItem
				disabled={open.isPending}
				onClick={() => message(firstCourse.courseId)}
			>
				<Mail className="mr-2 h-4 w-4" />
				Send Message
			</DropdownMenuItem>
		);
	}

	// Multiple courses → pick which conversation to open.
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<Mail className="mr-2 h-4 w-4" />
				Send Message
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{courses.map((course) => (
					<DropdownMenuItem
						disabled={open.isPending}
						key={course.courseId}
						onClick={() => message(course.courseId)}
					>
						{truncateTitle(course.title)}
					</DropdownMenuItem>
				))}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
