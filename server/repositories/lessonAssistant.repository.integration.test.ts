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

	// A message COUNT bounds neither cost nor prompt dilution: 20 turns at the
	// 2,000-char input cap is ~40 KB, so a student writing long messages gets 20×
	// the dilution of one writing short ones — backwards from what the limit is for.
	it("bounds the model context by characters, keeping whole newest messages", async () => {
		const long = "x".repeat(3_000);
		for (let i = 0; i < 5; i++) {
			await lessonAssistantRepository.saveMessage(lessonId, studentId, {
				role: "user",
				content: `${i}-${long}`,
			});
		}

		const context = await lessonAssistantRepository.getContextMessages(
			lessonId,
			studentId,
		);

		const chars = context.reduce((sum, m) => sum + m.content.length, 0);
		expect(chars).toBeLessThanOrEqual(8_000);
		// Newest kept, oldest dropped, and nothing split.
		expect(context.at(-1)?.content.startsWith("4-")).toBe(true);
		expect(context.every((m) => m.content.length === long.length + 2)).toBe(
			true,
		);
	});

	it("keeps at least one message even when it alone exceeds the budget", async () => {
		await lessonAssistantRepository.saveMessage(lessonId, studentId, {
			role: "user",
			content: "y".repeat(20_000),
		});

		const context = await lessonAssistantRepository.getContextMessages(
			lessonId,
			studentId,
		);

		expect(context).toHaveLength(1);
	});

	it("returns nothing when the conversation does not exist", async () => {
		expect(
			await lessonAssistantRepository.getContextMessages(lessonId, studentId),
		).toEqual([]);
	});
});
