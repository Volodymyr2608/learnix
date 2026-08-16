import { beforeEach, describe, expect, it } from "vitest";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { lessonAssistantRepository } from "./lessonAssistant.repository";

describe("lessonAssistantRepository context reads", () => {
	let lessonId: string;
	let studentId: string;

	beforeEach(async () => {
		const student = await makeUser({ role: "STUDENT" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		lessonId = lesson.id;
		studentId = student.id;
	});

	it("keeps ineligible rows out of model context but in the thread", async () => {
		await lessonAssistantRepository.saveMessage(lessonId, studentId, {
			role: "user",
			content: "off-topic payload",
			contextEligible: false,
		});
		await lessonAssistantRepository.saveMessage(lessonId, studentId, {
			role: "user",
			content: "real question",
		});

		const thread = await lessonAssistantRepository.getMessages(
			lessonId,
			studentId,
		);
		const context = await lessonAssistantRepository.getContextMessages(
			lessonId,
			studentId,
		);

		expect(thread.map((m) => m.content)).toEqual([
			"off-topic payload",
			"real question",
		]);
		expect(context.map((m) => m.content)).toEqual(["real question"]);
	});

	it("returns the most recent N in chronological order", async () => {
		for (let i = 0; i < 5; i++) {
			await lessonAssistantRepository.saveMessage(lessonId, studentId, {
				role: "user",
				content: `m${i}`,
			});
		}

		const context = await lessonAssistantRepository.getContextMessages(
			lessonId,
			studentId,
			3,
		);

		// Most recent three, oldest-first. A naive `orderBy asc` + `take` returns
		// m0..m2 — the OLDEST three, i.e. the exact opposite of a recency window.
		expect(context.map((m) => m.content)).toEqual(["m2", "m3", "m4"]);
	});

	it("markContextIneligible removes a message from the model context but not the thread", async () => {
		const saved = await lessonAssistantRepository.saveMessage(
			lessonId,
			studentId,
			{ role: "user", content: "payload" },
		);

		await lessonAssistantRepository.markContextIneligible(saved.id);

		const thread = await lessonAssistantRepository.getMessages(
			lessonId,
			studentId,
		);
		const context = await lessonAssistantRepository.getContextMessages(
			lessonId,
			studentId,
		);

		expect(thread.map((m) => m.content)).toContain("payload");
		expect(context.map((m) => m.content)).not.toContain("payload");
	});

	it("returns nothing when the conversation does not exist", async () => {
		expect(
			await lessonAssistantRepository.getContextMessages(lessonId, studentId),
		).toEqual([]);
	});
});
