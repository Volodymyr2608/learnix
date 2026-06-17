"use client";

import { DialogContent } from "@/app/_components/_shared/ui/dialog";
import { cn } from "@/lib/utils/cn";
import type {
	DialogBodyProps,
	ScrollableDialogContentProps,
} from "./types";

/**
 * DialogContent capped at 85vh and laid out as a flex column so that a
 * `DialogBody` between the (fixed) header and footer scrolls on overflow.
 * Use for any dialog whose body can grow beyond the viewport.
 */
export function ScrollableDialogContent({
	className,
	children,
	...props
}: ScrollableDialogContentProps) {
	return (
		<DialogContent
			className={cn("flex max-h-[85vh] flex-col overflow-hidden", className)}
			{...props}
		>
			{children}
		</DialogContent>
	);
}

/**
 * The scrollable region of a `ScrollableDialogContent`. Negative horizontal
 * margins let the scrollbar sit at the dialog edge while content stays aligned
 * with the header and footer padding.
 */
export function DialogBody({ className, ...props }: DialogBodyProps) {
	return (
		<div
			className={cn("-mx-6 flex-1 overflow-y-auto px-6", className)}
			data-slot="dialog-body"
			{...props}
		/>
	);
}