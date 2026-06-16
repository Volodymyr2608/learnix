import { Star, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { formatUsd } from "@/lib/formatUsd";
import type { TopCourseRowProps, TopPerformingCoursesProps } from "./types";

function TopCourseRow({ course }: TopCourseRowProps) {
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

export default function TopPerformingCourses({
	courses,
}: TopPerformingCoursesProps) {
	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-lg">Top Performing Courses</h2>
				<Button asChild size="sm" variant="ghost">
					<Link href={INSTRUCTOR_URLS.courses}>View All</Link>
				</Button>
			</div>

			{courses.length === 0 && (
				<p className="py-8 text-center text-muted-foreground text-sm">
					No course sales yet. Your top earners will appear here.
				</p>
			)}

			{courses.length > 0 && (
				<div className="space-y-4">
					{courses.map((course) => (
						<TopCourseRow course={course} key={course.courseId} />
					))}
				</div>
			)}
		</Card>
	);
}
