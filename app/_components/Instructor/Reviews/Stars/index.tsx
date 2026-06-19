import { Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { StarsProps } from "../types";

export function Stars({ rating, className }: StarsProps) {
	return (
		<div
			aria-label={`${rating} out of 5`}
			className={cn("flex items-center gap-0.5", className)}
			role="img"
		>
			{[1, 2, 3, 4, 5].map((i) => (
				<Star
					aria-hidden
					className={cn(
						"h-4 w-4",
						i <= rating
							? "fill-yellow-400 text-yellow-400"
							: "fill-muted text-muted",
					)}
					key={i}
				/>
			))}
		</div>
	);
}
