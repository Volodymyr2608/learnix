import { parseLessonDuration } from "@/lib/parse/parseLessonDuration";
import { db } from "@/server/db";

async function main() {
	// Only rows not yet backfilled and with a legacy value to read.
	const lessons = await db.lesson.findMany({
		where: { durationMinutes: null, duration: { not: null } },
		select: { id: true, duration: true },
	});

	let updated = 0;
	for (const lesson of lessons) {
		const minutes = parseLessonDuration(lesson.duration);
		if (minutes === null) continue; // leave null → counts as 0 later
		await db.lesson.update({
			where: { id: lesson.id },
			data: { durationMinutes: minutes },
		});
		updated += 1;
	}
	console.log(`Backfilled ${updated}/${lessons.length} lessons.`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => process.exit(0));
