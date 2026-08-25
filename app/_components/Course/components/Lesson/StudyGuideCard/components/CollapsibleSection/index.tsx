"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { CollapsibleSectionProps } from "./types";

export const CollapsibleSection = ({
	title,
	children,
	defaultOpen = false,
}: CollapsibleSectionProps) => {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div>
			<button
				className="flex w-full items-center gap-2 py-2 text-left font-semibold text-sm hover:text-foreground/80"
				onClick={() => setOpen((o) => !o)}
				type="button"
			>
				{open ? (
					<ChevronDown className="h-4 w-4 shrink-0" />
				) : (
					<ChevronRight className="h-4 w-4 shrink-0" />
				)}
				{title}
			</button>
			{open && <div className="pb-2 pl-6">{children}</div>}
		</div>
	);
};
