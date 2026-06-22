import { ArrowLeft, Edit } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import type { PreviewHeaderProps } from "./types";

export function PreviewHeader({ courseId }: PreviewHeaderProps) {
	return (
		<>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link href={INSTRUCTOR_URLS.courses}>
						<Button size="icon" variant="ghost">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h1 className="font-bold text-2xl">Course Preview</h1>
						<p className="text-muted-foreground text-sm">
							This is how students will see your course
						</p>
					</div>
				</div>
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.editCourse(courseId) as string}>
						<Edit className="mr-2 h-4 w-4" />
						Edit Course
					</Link>
				</Button>
			</div>

			<div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100">
				<strong>Preview Mode:</strong> This is how your course appears to
				potential students. Make sure everything looks perfect before
				publishing.
			</div>
		</>
	);
}
