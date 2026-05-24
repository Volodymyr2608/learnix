import { PrismaClient } from "@/generated/prisma";

export const testDb = new PrismaClient();

// SQL table names (from @@map in Prisma schema), ordered leaf-to-root so CASCADE handles FKs.
const TABLES = [
	"lesson_progress",
	"course_progress",
	"enrollments",
	"course_reviews",
	"lesson_assistant_messages",
	"lesson_assistant_conversations",
	"concept_mastery",
	"learning_path_cache",
	"lesson_insights",
	"lesson_chunk_embeddings",
	"lessons",
	"sections",
	"course_generation_messages",
	"course_generations",
	"course_embeddings",
	"user_interest_embeddings",
	"courses",
	"instructor_profiles",
	"notification_logs",
	"posts",
	"sessions",
	"accounts",
	"verifications",
	"users",
];

export async function truncateAll(): Promise<void> {
	const list = TABLES.map((t) => `"${t}"`).join(", ");
	await testDb.$executeRawUnsafe(
		`TRUNCATE ${list} RESTART IDENTITY CASCADE;`,
	);
}