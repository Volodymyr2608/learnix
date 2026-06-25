import { Skeleton } from "@/app/_components/_shared/ui/skeleton";

export const ThreadSkeleton = () => {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-9 w-2/5 rounded-2xl" />
			<Skeleton className="ml-auto h-9 w-1/2 rounded-2xl" />
			<Skeleton className="h-16 w-3/5 rounded-2xl" />
			<Skeleton className="ml-auto h-9 w-1/3 rounded-2xl" />
		</div>
	);
};
