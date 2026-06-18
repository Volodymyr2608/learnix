import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { ContinueLearningProps, ContinueLearningRowProps } from "./types";

function ContinueLearningRow({ item }: ContinueLearningRowProps) {
	return (
		<Link
			className="block space-y-2 rounded-md p-2 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
			href={`/dashboard/courses/${item.courseId}/learn/${item.nextLessonId}`}
		>
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium">{item.courseTitle}</p>
					<p className="text-muted-foreground text-sm">
						{item.nextLessonTitle}
					</p>
				</div>
				<span className="font-medium text-sm">{item.progress}%</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-secondary">
				<div
					className="h-full bg-primary transition-all"
					style={{ width: `${item.progress}%` }}
				/>
			</div>
		</Link>
	);
}

export default function ContinueLearning({ items }: ContinueLearningProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Continue Learning</CardTitle>
				<CardDescription>Pick up where you left off</CardDescription>
			</CardHeader>
			<CardContent>
				{items.length === 0 && (
					<p className="text-muted-foreground text-sm">
						No courses in progress yet. Browse the catalog to get started.
					</p>
				)}
				{items.length > 0 && (
					<div className="space-y-2">
						{items.map((item) => (
							<ContinueLearningRow item={item} key={item.courseId} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
