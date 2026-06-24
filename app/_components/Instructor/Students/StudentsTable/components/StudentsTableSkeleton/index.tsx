import { Skeleton } from "@/app/_components/_shared/ui/skeleton";
import { SKELETON_ROWS } from "../../constants/skeleton";

export function StudentsTableSkeleton() {
	return (
		<>
			{SKELETON_ROWS.map((key) => (
				<tr className="border-b last:border-0" key={key}>
					<td className="px-6 py-4">
						<div className="flex items-center gap-3">
							<Skeleton className="h-10 w-10 rounded-full" />
							<div className="space-y-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-40" />
							</div>
						</div>
					</td>
					<td className="px-6 py-4">
						<div className="flex gap-1">
							<Skeleton className="h-5 w-16 rounded-full" />
							<Skeleton className="h-5 w-16 rounded-full" />
						</div>
					</td>
					<td className="px-6 py-4">
						<div className="flex items-center gap-3">
							<Skeleton className="h-2 w-24 rounded-full" />
							<Skeleton className="h-4 w-8" />
						</div>
					</td>
					<td className="px-6 py-4">
						<Skeleton className="h-4 w-20" />
					</td>
					<td className="px-6 py-4">
						<Skeleton className="h-5 w-16 rounded-full" />
					</td>
					<td className="px-6 py-4">
						<div className="flex justify-end">
							<Skeleton className="h-8 w-8 rounded-md" />
						</div>
					</td>
				</tr>
			))}
		</>
	);
}
