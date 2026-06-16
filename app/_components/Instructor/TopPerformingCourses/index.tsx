import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import TopCourseRow from "./components/TopCourseRow";
import type { TopPerformingCoursesProps } from "./types";

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
