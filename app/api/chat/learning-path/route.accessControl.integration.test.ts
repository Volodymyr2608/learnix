import { beforeEach, describe, expect, it, vi } from "vitest";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockGetSession, mockStreamRegenerate } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockStreamRegenerate: vi.fn(),
}));

vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
vi.mock("@/server/services/learningPathAI/learningPathAI.service", () => ({
	learningPathAIService: { streamRegenerate: mockStreamRegenerate },
}));

const { POST } = await import("./route");

const capturedCourseIds: unknown[] = [];

/**
 * Д2 in its second form. Here `findByStudentCourse` binds studentId and courseId
 * in a single query, so the access *check* is sound — but the raw request value,
 * not the enrollment's own courseId, is what flows into streamRegenerate, where
 * `listOrderedWithConcepts` scopes on courseId alone.
 */
describe("POST /api/chat/learning-path — access control on courseId", () => {
	let studentId: string;
	let courseAId: string;
	let unboughtCourseId: string;

	beforeEach(async () => {
		capturedCourseIds.length = 0;
		mockStreamRegenerate.mockReset();
		mockStreamRegenerate.mockImplementation(async function* (
			_studentId: string,
			courseId: unknown,
		) {
			capturedCourseIds.push(courseId);
			yield { type: "token" as const, value: "ok" };
		});

		const student = await makeUser({ role: "STUDENT" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });

		const courseA = await makeCourse({ instructorId: instructor.id });
		const sectionA = await makeSection({ courseId: courseA.id });
		await makeLesson({ sectionId: sectionA.id, title: "Bought A" });
		await makeEnrollment({ studentId: student.id, courseId: courseA.id });

		// A second, legitimate enrollment — this is what lets `{ not: A }` match an
		// enrollment at all. A single-course fixture would 403 and read as proof
		// the route is safe, which is exactly the false negative Д2 first produced.
		const courseB = await makeCourse({ instructorId: instructor.id });
		const sectionB = await makeSection({ courseId: courseB.id });
		await makeLesson({ sectionId: sectionB.id, title: "Bought B" });
		await makeEnrollment({ studentId: student.id, courseId: courseB.id });

		// Never bought. Its lesson titles must never reach this student.
		const courseC = await makeCourse({ instructorId: instructor.id });
		const sectionC = await makeSection({ courseId: courseC.id });
		await makeLesson({ sectionId: sectionC.id, title: "Never Bought" });

		studentId = student.id;
		courseAId = courseA.id;
		unboughtCourseId = courseC.id;

		mockGetSession.mockResolvedValue({
			user: { id: studentId, role: "STUDENT" },
		});
	});

	const post = (courseId: unknown) =>
		POST(
			new Request("http://localhost/api/chat/learning-path", {
				method: "POST",
				body: JSON.stringify({ courseId }),
			}),
		);

	it("control: rejects a course the student is not enrolled in", async () => {
		const res = await post(unboughtCourseId);

		expect(res.status).toBe(403);
		expect(capturedCourseIds).toEqual([]);
	});

	it("control: allows an enrolled course", async () => {
		const res = await post(courseAId);

		expect(res.status).toBe(200);
		expect(capturedCourseIds).toEqual([courseAId]);
	});

	it("rejects a Prisma filter object in place of a course id", async () => {
		const res = await post({ not: courseAId });

		expect(res.status).toBe(400);
		expect(capturedCourseIds).toEqual([]);
	});

	// Characterization, not a regression guard: this asserts what the repository
	// does with an unbound filter, and stays green after the fix. It is the
	// evidence for *why* the route may never forward an unvalidated value — this
	// is the data that escapes once validation is gone.
	it("hazard: listOrderedWithConcepts scopes on courseId alone", async () => {
		const rows = await lessonRepository.listOrderedWithConcepts({
			not: courseAId,
		} as unknown as string);

		expect(rows.map((r) => r.title)).toContain("Never Bought");
	});
});
