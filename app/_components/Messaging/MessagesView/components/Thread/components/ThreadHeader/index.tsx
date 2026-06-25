import { ArrowLeft } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Skeleton } from "@/app/_components/_shared/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { getAvatarColorClass, getInitials } from "../../../../utils";
import type { ThreadHeaderProps } from "./types";

export const ThreadHeader = ({
	name,
	courseTitle,
	isLoading,
	onBack,
}: ThreadHeaderProps) => {
	return (
		<div className="flex items-center gap-3 border-b px-4 py-3">
			<Button
				className="md:hidden"
				onClick={onBack}
				size="icon-sm"
				variant="ghost"
			>
				<ArrowLeft />
				<span className="sr-only">Back to conversations</span>
			</Button>
			{isLoading && (
				<>
					<Skeleton className="size-9 shrink-0 rounded-full" />
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3 w-24" />
					</div>
				</>
			)}

			{!isLoading && (
				<>
					<span
						className={cn(
							"flex size-9 shrink-0 items-center justify-center rounded-full font-medium text-xs",
							getAvatarColorClass(name),
						)}
					>
						{getInitials(name)}
					</span>
					<div className="min-w-0">
						<p className="truncate font-semibold text-sm">{name}</p>
						{courseTitle && (
							<p className="truncate text-muted-foreground text-xs">
								{courseTitle}
							</p>
						)}
					</div>
				</>
			)}
		</div>
	);
};
