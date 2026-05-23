// Usage: pnpm tsx scripts/fire-test-event.ts <certificate.earned|progress.near_completion> <enrollmentId>
import { notificationService } from "@/server/services/notifications/notification.service";

const [type, enrollmentId] = process.argv.slice(2);

if (
	!type ||
	!enrollmentId ||
	!["certificate.earned", "progress.near_completion"].includes(type)
) {
	console.error(
		"Usage: tsx scripts/fire-test-event.ts <certificate.earned|progress.near_completion> <enrollmentId>",
	);
	process.exit(1);
}

if (type === "certificate.earned") {
	await notificationService.fireCertificateEarned(enrollmentId);
} else {
	await notificationService.fireProgressNearCompletion("test", enrollmentId, {
		completedLessons: 8,
		totalLessons: 10,
		lessonsRemaining: 2,
		nextLessonId: null,
		nextLessonTitle: "Final Lesson",
	});
}

console.log("Event fired.");
