import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { db } from "@/server/db";

export const buildGetStudentProgressTool = (studentId: string, courseId: string) =>
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
      return `Completed lessons:\n${completed.map((p) => `- ${p.lesson.title}`).join("\n")}`;
    },
    {
      name: "get_student_progress",
      description:
        "Returns the list of lessons the student has already completed in this course. Use this to tailor explanations to their level.",
      schema: z.object({}),
    },
  );