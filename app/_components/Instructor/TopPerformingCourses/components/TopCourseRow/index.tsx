import { Star, Users } from "lucide-react";
import { formatUsd } from "@/lib/formatUsd";
import type { TopCourseRowProps } from "./types";

export default function TopCourseRow({ course }: TopCourseRowProps) {
	return (
		<div className="flex items-center justify-between rounded-lg border p-4">
			<div className="flex-1">
				<h3 className="font-medium">{course.title}</h3>
				<div className="mt-1 flex items-center gap-4 text-muted-foreground text-sm">
					<span className="flex items-center gap-1">
						<Users className="h-4 w-4" />
						{course.students} students
					</span>
					<span className="flex items-center gap-1">
						<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
						{course.rating === null ? "—" : course.rating.toFixed(1)}
					</span>
				</div>
			</div>
			<div className="text-right">
				<p className="font-semibold text-green-600">
					{formatUsd(course.grossCents)}
				</p>
			</div>
		</div>
	);
}
