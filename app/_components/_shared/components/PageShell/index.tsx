import { cn } from "@/lib/utils/cn";
import type { PageShellProps } from "./types";

export function PageShell({
	title,
	description,
	icon: Icon,
	iconClassName,
	action,
	children,
}: PageShellProps) {
	return (
		<div className="space-y-6">
			<div
				className={
					action
						? "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
						: undefined
				}
			>
				<div className={Icon ? "flex items-center gap-4" : undefined}>
					{Icon && (
						<div
							className={cn(
								"flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
								iconClassName,
							)}
						>
							<Icon className="h-6 w-6" />
						</div>
					)}
					<div>
						<h1 className="font-bold text-3xl">{title}</h1>
						<p className="text-muted-foreground">{description}</p>
					</div>
				</div>
				{action}
			</div>
			{children}
		</div>
	);
}
