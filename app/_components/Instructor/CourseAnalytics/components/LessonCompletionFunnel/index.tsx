import { Card } from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { LessonCompletionFunnelProps } from "./types";

export default function LessonCompletionFunnel({
	lessons,
}: LessonCompletionFunnelProps) {
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Lesson Completion Funnel</h2>
				<p className="text-muted-foreground text-sm">
					Where students drop off, lesson by lesson
				</p>
			</div>
			{lessons.length === 0 && (
				<p className="py-8 text-center text-muted-foreground text-sm">
					This course has no lessons yet.
				</p>
			)}
			{lessons.length > 0 && (
				<ol className="space-y-4">
					{lessons.map((lesson) => {
						const pct =
							lesson.enrolled === 0
								? 0
								: Math.round((lesson.completed / lesson.enrolled) * 100);
						return (
							<li className="flex items-center gap-4" key={lesson.lessonId}>
								<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-xs">
									{lesson.order + 1}
								</span>
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-2">
										<span className="truncate font-medium text-sm">
											{lesson.title}
										</span>
										<span className="shrink-0 text-muted-foreground text-sm">
											{lesson.completed}/{lesson.enrolled} ({pct}%)
										</span>
									</div>
									<Progress className="mt-2 h-2" value={pct} />
								</div>
							</li>
						);
					})}
				</ol>
			)}
		</Card>
	);
}
