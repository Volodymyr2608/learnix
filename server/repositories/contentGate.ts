import type { Prisma } from "@/generated/prisma";

/**
 * FR-P19a / G1 — the one content gate: a `Lesson` where-fragment matching only lessons this
 * student has opened. Every student-facing reader of lesson content joins it inside its
 * authorizing query (security.md §AI controls), and the reader registry
 * (`contentReaders.contract.test.ts`) checks that each gated reader does.
 */
export const lessonOpenedBy = (studentId: string): Prisma.LessonWhereInput => ({
	openedBy: { some: { studentId } },
});
