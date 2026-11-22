import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeOpenedLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { lessonOpenedBy } from "./contentGate";

describe("lessonOpenedBy (G1)", () => {
	let studentId: string;
	let otherId: string;
	let opened: string;
	let unopened: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		otherId = (await makeUser()).id;
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		opened = (await makeLesson({ sectionId: section.id, order: 1 })).id;
		unopened = (await makeLesson({ sectionId: section.id, order: 2 })).id;
		await makeOpenedLesson({ studentId, lessonId: opened });
		await makeOpenedLesson({ studentId: otherId, lessonId: unopened });
	});

	it("matches only the lessons this student opened", async () => {
		const rows = await testDb.lesson.findMany({
			where: { ...lessonOpenedBy(studentId) },
			select: { id: true },
		});
		expect(rows.map((r) => r.id)).toEqual([opened]);
	});
});
