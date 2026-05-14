import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { db } from "@/server/db";

export const buildGetQuizAttemptHistoryTool = (studentId: string) =>
  tool(
    async ({ lessonId }: { lessonId: string }) => {
      const attempts = await db.quizAttempt.findMany({
        where: { studentId, quiz: { lessonId } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { quizId: true, isCorrect: true, selectedAnswer: true, createdAt: true },
      });
      if (attempts.length === 0) return "No quiz attempts for this lesson.";
      return JSON.stringify(
        attempts.map((a) => ({
          quizId: a.quizId,
          isCorrect: a.isCorrect,
          selectedAnswer: a.selectedAnswer,
          attemptedAt: a.createdAt,
        })),
      );
    },
    {
      name: "get_quiz_attempt_history",
      description:
        "Returns the last 5 quiz attempts for all quizzes in the specified lesson for the current student.",
      schema: z.object({ lessonId: z.string() }),
    },
  );