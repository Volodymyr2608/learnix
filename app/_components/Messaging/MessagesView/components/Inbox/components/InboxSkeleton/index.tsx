import { Skeleton } from "@/app/_components/_shared/ui/skeleton";

export function InboxSkeleton() {
	return (
		<div>
			{[0, 1, 2, 3, 4].map((i) => (
				<div className="flex items-start gap-3 border-b px-4 py-3" key={i}>
					<Skeleton className="size-10 shrink-0 rounded-full" />
					<div className="flex flex-1 flex-col gap-2 py-0.5">
						<Skeleton className="h-3 w-2/3" />
						<Skeleton className="h-3 w-1/3" />
						<Skeleton className="h-3 w-4/5" />
					</div>
				</div>
			))}
		</div>
	);
}
