import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/app/_components/_shared/ui/button";
import { LessonContentEditor } from "@/app/_components/Course/components/Lesson/LessonContentEditor";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getLessonById from "@/lib/requests/lesson/getLessonById";

export default async function InstructorLessonEditorPage({
	params,
}: {
	params: Promise<{ courseId: string; lessonId: string }>;
}) {
	const { courseId, lessonId } = await params;

	const lesson = await getLessonById(lessonId);

	if (!lesson) {
		notFound();
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link href={INSTRUCTOR_URLS.editCourse(courseId)}>
					<Button size="icon" variant="ghost">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">
						Edit Lesson Content
					</h1>
					<p className="text-muted-foreground">
						Add videos, text, resources, and quizzes to this lesson
					</p>
				</div>
			</div>

			<LessonContentEditor courseId={courseId} initialLesson={lesson} />
		</div>
	);
}
