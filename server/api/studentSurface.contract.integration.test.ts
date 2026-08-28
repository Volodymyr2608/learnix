// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import SuperJSON from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { appRouter, createCaller } from "@/server/api/root";
import { testDb } from "@/test/db";
import { findKeyPaths } from "@/test/deepKeys";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeLessonInsights,
	makeQuiz,
	makeSection,
	makeUser,
} from "@/test/factories";

/**
 * Routers skipped, and why: each one reaches an external service (OpenAI,
 * Stripe) on at least one procedure, so sweeping them would buy network flakes
 * rather than coverage. None of them reads a quiz row — `security.md` S5 traced
 * that, and the model-side twin of this sweep is the static assertion in
 * `quizFieldExposure.contract.test.ts`, which needs no invocation at all.
 */
const SKIPPED_ROUTERS = new Set([
	"search",
	"payment",
	"learningPath",
	"courseAI",
	"lessonInsightsAI",
]);

/**
 * Mutations are not swept — they are side effects, and most of them cost money
 * or a model call. `quiz.submit` is the one that must be, because it is the
 * other half of the quiz surface.
 */
const SWEPT_MUTATIONS = new Set(["quiz.submit"]);

type ProcedureType = "query" | "mutation";

const procedures = (): { name: string; type: ProcedureType }[] =>
	Object.entries(
		(
			appRouter as unknown as {
				_def: { procedures: Record<string, { _def: { type: ProcedureType } }> };
			}
		)._def.procedures,
	).map(([name, p]) => ({ name, type: p._def.type }));

const callByPath = (
	caller: ReturnType<typeof createCaller>,
	path: string,
	input: unknown,
): Promise<unknown> => {
	const [router, procedure] = path.split(".");
	const target = (caller as unknown as Record<string, Record<string, unknown>>)[
		router as string
	]?.[procedure as string];
	if (typeof target !== "function") {
		throw new Error(`no callable procedure at ${path}`);
	}
	return (target as (arg?: unknown) => Promise<unknown>)(input);
};

describe("no student-reachable response carries the answer key", () => {
	let caller: ReturnType<typeof createCaller>;
	let inputs: unknown[];
	let quizId: string;
	let exercised: { name: string; payload: unknown }[];

	// Seeded and swept once: every procedure the student can reach is invoked,
	// and the three assertions below read the same captured payloads. Sweeping
	// per test would triple a run that is already the slowest in the suite.
	beforeAll(async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makeLessonInsights({ lessonId: lesson.id });
		const quiz = await makeQuiz({
			lessonId: lesson.id,
			options: ["A", "B", "C", "D"],
			correct: "SENTINEL",
		});
		quizId = quiz.id;

		caller = createCaller({
			db: testDb,
			headers: new Headers(),
			session: {
				user: { id: student.id, role: Role.STUDENT },
				session: { id: "s1" },
			},
		} as never);

		// Every input shape the swept procedures accept. A procedure is exercised
		// with the first one it does not reject, so a new procedure joins the sweep
		// as soon as one of these fits — and is reported as unexercised if none do.
		inputs = [
			undefined,
			lesson.id,
			course.id,
			quiz.id,
			{ lessonId: lesson.id },
			{ courseId: course.id },
			{ courseId: course.id, lessonId: lesson.id },
			{ quizId: quiz.id, selectedAnswer: "A" },
		];

		exercised = await sweep();
	}, 120_000);

	const sweep = async () => {
		const reached: { name: string; payload: unknown }[] = [];

		for (const { name, type } of procedures()) {
			const [router] = name.split(".");
			if (SKIPPED_ROUTERS.has(router as string)) continue;
			if (type === "mutation" && !SWEPT_MUTATIONS.has(name)) continue;

			for (const input of inputs) {
				try {
					const result = await callByPath(caller, name, input);
					reached.push({
						name,
						payload: SuperJSON.parse(SuperJSON.stringify(result)),
					});
					break;
				} catch {
					// Wrong input shape, or a procedure this student may not call.
					// Either way it returned no payload, so there is nothing to walk.
				}
			}
		}

		return reached;
	};

	it("finds no `correct` key at any depth, from any procedure it can reach", () => {
		const leaks = exercised.flatMap(({ name, payload }) =>
			findKeyPaths(payload, "correct").map((path) => `${name} → ${path}`),
		);
		expect(leaks, leaks.join("\n")).toEqual([]);
	});

	// Without this the sweep passes by reaching nothing at all. The two
	// procedures named here are the ones that returned the key before this
	// feature, so a sweep that stops exercising them has stopped testing.
	it("actually reaches the two procedures that used to carry it", () => {
		const names = exercised.map((e) => e.name);

		expect(names).toContain("quiz.getByLesson");
		expect(names).toContain("lesson.getStudentLesson");
		expect(names.length).toBeGreaterThanOrEqual(10);
	});

	// The sentinel is the answer to the seeded quiz. Text, not keys, this time:
	// it catches a leak that renames the field on the way out.
	it("never echoes the answer text either", () => {
		const leaks = exercised
			.filter(({ payload }) => JSON.stringify(payload)?.includes("SENTINEL"))
			.map(({ name }) => name);
		expect(leaks, `${leaks.join(", ")} (quiz ${quizId})`).toEqual([]);
	});
});
