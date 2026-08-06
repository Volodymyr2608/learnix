import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { db } from "@/server/db";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";

export const buildGetStudentProgressTool = (
	studentId: string,
	courseId: string,
) =>
	tool(
		async () => {
			const completed = await db.lessonProgress.findMany({
				where: {
					studentId,
					isCompleted: true,
					lesson: { section: { courseId } },
				},
				include: { lesson: { select: { title: true } } },
			});
			if (completed.length === 0) {
				return "Student has not completed any lessons yet.";
			}
			// Lesson titles are instructor-authored free text, exactly like a
			// lesson body — the id scoping is sound, the content is not trusted.
			return wrapUntrustedContent(
				`Completed lessons:\n${completed.map((p) => `- ${p.lesson.title}`).join("\n")}`,
				"lesson_content",
			);
		},
		{
			name: "get_student_progress",
			description:
				"Returns the list of lessons the student has already completed in this course. Use this to tailor explanations to their level.",
			schema: z.object({}),
		},
	);
