import type { PageShellProps } from "./types";

export function PageShell({
	title,
	description,
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
				<div>
					<h1 className="font-bold text-3xl">{title}</h1>
					<p className="text-muted-foreground">{description}</p>
				</div>
				{action}
			</div>
			{children}
		</div>
	);
}
