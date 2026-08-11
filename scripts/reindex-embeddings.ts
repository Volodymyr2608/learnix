import { courseRepository } from "@/server/repositories/course.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import {
	NOT_ANONYMISED,
	userRepository,
} from "@/server/repositories/user.repository";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";

async function main() {
	console.log("Reindexing courses...");
	const courses = await courseRepository.findMany({
		where: { status: "published", deletedAt: null },
		select: {
			id: true,
			title: true,
			subtitle: true,
			description: true,
			objectives: true,
		},
	});
	for (const course of courses) {
		await embeddingsService.embedCourse({
			id: course.id,
			title: course.title,
			subtitle: course.subtitle ?? null,
			description: course.description ?? null,
			objectives: course.objectives,
		});
		console.log(`  ✓ course ${course.id}`);
	}

	console.log("Reindexing lessons...");
	const lessons = await lessonRepository.findMany({
		where: { content: { not: null }, deletedAt: null },
		select: { id: true, content: true },
	});
	for (const lesson of lessons) {
		if (lesson.content) {
			await embeddingsService.embedLessonChunks({
				id: lesson.id,
				content: lesson.content,
			});
			console.log(`  ✓ lesson ${lesson.id}`);
		}
	}

	console.log("Recomputing user interest embeddings...");
	// Anonymised accounts keep their enrollments, so they match this filter — but
	// rebuilding their interest embedding would resurrect the behavioural profile
	// `anonymiseAccount` destroyed, and they can never sign in to use it.
	const users = await userRepository.findMany({
		where: { enrollments: { some: {} }, ...NOT_ANONYMISED },
		select: { id: true },
	});
	for (const user of users) {
		await embeddingsService.recomputeUserInterest(user.id);
		console.log(`  ✓ user ${user.id}`);
	}

	console.log("Done.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
