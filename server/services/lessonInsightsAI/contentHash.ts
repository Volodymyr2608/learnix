import { createHash } from "node:crypto";

/**
 * The fingerprint of the lesson text a study guide was generated from, stored
 * as `LessonInsights.contentHash`.
 *
 * It exists as a named function because TWO paths depend on agreeing exactly:
 * `generateForLesson` writes it and short-circuits on a match, and
 * `getForLesson` recomputes it to tell the instructor whether regenerating
 * would do anything. Two inline `createHash` calls would be one `.trim()` away
 * from disagreeing, and the failure is silent in both directions — a Regenerate
 * button that stays disabled on changed content, or one that promises a
 * regeneration the service then declines to perform.
 */
export const lessonContentHash = (content: string): string =>
	createHash("sha256").update(content).digest("hex");
