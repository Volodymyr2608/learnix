import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { getAvatarColorClass, getInitials } from "../../../../utils";
import type { MessageBubbleProps } from "./types";

export const MessageBubble = ({
	message: m,
	otherParticipantName,
	isFirstInGroup,
	isLastInGroup,
}: MessageBubbleProps) => {
	const time = format(new Date(m.createdAt), "HH:mm");

	if (m.isMine) {
		return (
			<div
				className={cn(
					"flex flex-col items-end",
					isFirstInGroup ? "mt-3" : "mt-1",
				)}
			>
				<div
					className={cn(
						"w-fit max-w-[75%] whitespace-pre-wrap break-words rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground text-sm",
						!isFirstInGroup && "rounded-tr-md",
					)}
				>
					{m.body}
					<span className="mt-0.5 block select-none text-right text-[10px] text-primary-foreground/70">
						{time}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn("flex items-end gap-2", isFirstInGroup ? "mt-3" : "mt-1")}
		>
			{isLastInGroup ? (
				<span
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-[10px]",
						getAvatarColorClass(otherParticipantName),
					)}
				>
					{getInitials(otherParticipantName)}
				</span>
			) : (
				<span className="size-7 shrink-0" />
			)}
			<div
				className={cn(
					"w-fit max-w-[75%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-3.5 py-2 text-sm",
					!isFirstInGroup && "rounded-tl-md",
				)}
			>
				{m.body}
				<span className="mt-0.5 block select-none text-right text-[10px] text-muted-foreground">
					{time}
				</span>
			</div>
		</div>
	);
};
