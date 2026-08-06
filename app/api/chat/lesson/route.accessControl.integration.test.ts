import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockGetSession, mockCheckTopicRelevance, mockStreamResponse } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockCheckTopicRelevance: vi.fn(),
		mockStreamResponse: vi.fn(),
	}));

vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
vi.mock("@/server/services/_shared/aiGuard/topicRelevance", () => ({
	checkTopicRelevance: mockCheckTopicRelevance,
}));
vi.mock("@/server/services/lessonAI/lessonAI.service", () => ({
	lessonAIService: { streamResponse: mockStreamResponse },
}));

const { POST } = await import("./route");

/**
 * Records which lesson/course the tutor was actually built for, so a leak stays
 * observable even when the response body itself looks innocuous.
 */
const capturedCalls: Array<{ lessonId: string; courseId: string }> = [];

/**
 * Д2 — the route reads `lessonId` straight off `req.json()` with no schema
 * validation, then uses it in two *unrelated* Prisma queries: one proves access
 * (route.ts:34), the other fetches the lesson (route.ts:46). If Prisma accepts a
 * filter object where a string id is expected, the query that proves access and
 * the query that acts on it can resolve to different lessons.
 */
describe("POST /api/chat/lesson — access control on lessonId", () => {
	let studentId: string;
	let ownLessonId: string;
	let ownCourseId: string;
	let foreignLessonId: string;

	beforeEach(async () => {
		capturedCalls.length = 0;
		mockCheckTopicRelevance.mockReset();
		mockStreamResponse.mockReset();

		mockCheckTopicRelevance.mockResolvedValue({
			onTopic: true,
			reason: "on topic",
		});
		mockStreamResponse.mockImplementation(async function* (params: {
			lessonId: string;
			courseId: string;
		}) {
			capturedCalls.push({
				lessonId: params.lessonId,
				courseId: params.courseId,
			});
			yield { type: "token" as const, value: "ok" };
		});

		const student = await makeUser({ role: "STUDENT" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });

		// Course B is created FIRST so its lesson row sits earliest in physical
		// order — findFirst has no orderBy, so this is the row an unconstrained
		// filter lands on. No enrollment: its content must never reach this student.
		const courseB = await makeCourse({
			instructorId: instructor.id,
			title: "Paid Course The Student Never Bought",
		});
		const sectionB = await makeSection({ courseId: courseB.id });
		const foreignLesson = await makeLesson({
			sectionId: sectionB.id,
			title: "Secret Lesson",
		});

		// Course A — the student paid for this one. TWO lessons, so a filter that
		// excludes the first still matches the second and the enrollment check on
		// route.ts:34 passes.
		const courseA = await makeCourse({
			instructorId: instructor.id,
			title: "Intro to Python",
		});
		const sectionA = await makeSection({ courseId: courseA.id });
		const ownLesson = await makeLesson({
			sectionId: sectionA.id,
			title: "Recursion",
			order: 0,
		});
		await makeLesson({
			sectionId: sectionA.id,
			title: "Iteration",
			order: 1,
		});
		await makeEnrollment({ studentId: student.id, courseId: courseA.id });

		studentId = student.id;
		ownLessonId = ownLesson.id;
		ownCourseId = courseA.id;
		foreignLessonId = foreignLesson.id;

		mockGetSession.mockResolvedValue({
			user: { id: studentId, role: "STUDENT" },
		});
	});

	const post = (lessonId: unknown) =>
		POST(
			new Request("http://localhost/api/chat/lesson", {
				method: "POST",
				body: JSON.stringify({ lessonId, message: "Explain this lesson" }),
			}),
		);

	it("control: rejects a plain foreign lesson id", async () => {
		const res = await post(foreignLessonId);

		expect(res.status).toBe(403);
		expect(capturedCalls).toEqual([]);
	});

	it("control: allows the student's own lesson", async () => {
		const res = await post(ownLessonId);

		expect(res.status).toBe(200);
		expect(capturedCalls).toEqual([
			{ lessonId: ownLessonId, courseId: ownCourseId },
		]);
	});

	// The attack: the student knows their own lesson id (it is in their URL) and
	// asks for "any lesson that is not this one". The enrollment check on line 34
	// still matches course A — it only asks whether *some* lesson in an enrolled
	// course satisfies the filter. The fetch on line 46 is unconstrained by
	// enrollment and can land on course B.
	it("rejects a Prisma filter object in place of a lesson id", async () => {
		const res = await post({ not: ownLessonId });

		expect(res.status).not.toBe(200);
		expect(capturedCalls).toEqual([]);
	});

	// The invariant that replaces the original probe. That probe asserted against
	// the repositories directly, reproducing the two divergent queries, so no
	// route-level fix could turn it green — it proved the divergence existed and
	// its job ended there. What holds now is that the course which authorized the
	// request is the course the tutor is scoped to, because one query answers both.
	it("scopes the tutor to the course that authorized the request", async () => {
		const res = await post(ownLessonId);

		expect(res.status).toBe(200);
		expect(capturedCalls).toEqual([
			{ lessonId: ownLessonId, courseId: ownCourseId },
		]);
	});
});
