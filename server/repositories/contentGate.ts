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

/**
 * The same gate as a `select` fragment, for readers that must tell an unopened lesson apart from a
 * missing one inside their authorizing query (tutor route 403 vs 404; quiz FORBIDDEN). The open
 * exists when `openedBy` is non-empty.
 */
export const lessonOpenedSelect = (studentId: string) =>
	({
		openedBy: {
			where: { studentId },
			select: { studentId: true },
			take: 1,
		},
	}) satisfies Prisma.LessonSelect;
