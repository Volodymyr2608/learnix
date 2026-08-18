import { z } from "zod";

/**
 * The whole input a student controls on the learning-path surface. It is one
 * bounded id and nothing else — that is what lets learningPathAI run without an
 * L1/L2 input guard (see UNGUARDED_BY_DESIGN). Adding a free-text field here
 * fails the unguarded-by-design contract test.
 */
export const LearningPathCourseDto = z.object({
	courseId: z.string().min(1).max(64),
});

export type LearningPathCourseDto = z.infer<typeof LearningPathCourseDto>;
