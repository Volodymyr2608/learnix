import { describe, expect, it } from "vitest";
import { lessonGuardDomain, MAX_DOMAIN_CONCEPTS } from "./guardDomain";

const base = {
	courseTitle: "Building Modern Apps with Next.js, Prisma & PostgreSQL",
	lessonTitle: "Overview of Next.js",
};

describe("lessonGuardDomain", () => {
	/**
	 * The defect this exists for, measured against the shipped classifier on
	 * 2026-08-30 with a description built from the two titles alone: "Can you
	 * check my understanding of Optimization and SEO Features?" came back
	 * off-topic 5 times out of 5. The concept is one of that lesson's seven and
	 * shares no vocabulary with "Overview of Next.js", so the classifier was not
	 * wrong on its own terms — it was never told the concept was in scope.
	 *
	 * Two layers contradicted each other: the tutor's prompt asks for a check
	 * when the student claims to understand a concept, and naming the concept is
	 * how a student does that.
	 */
	it("puts the lesson's concepts in scope, not just its title", () => {
		const domain = lessonGuardDomain({
			...base,
			concepts: ["Optimization and SEO Features", "API Routes"],
		});

		expect(domain.description).toContain("Overview of Next.js");
		expect(domain.description).toContain("Optimization and SEO Features");
		expect(domain.description).toContain("API Routes");
	});

	it("names the course in the student-facing subject, and nothing else", () => {
		const domain = lessonGuardDomain({ ...base, concepts: ["API Routes"] });

		// The off-topic refusal is built from this. A concept list there would read
		// as noise to a student and disclose the lesson's structure to someone who
		// has just been refused.
		expect(domain.subject).toBe(`the "${base.courseTitle}" course`);
		expect(domain.subject).not.toContain("API Routes");
	});

	it("reads exactly as before when a lesson has no insights yet", () => {
		const domain = lessonGuardDomain({ ...base, concepts: [] });

		expect(domain.description).toBe(
			`the course "${base.courseTitle}" and its lesson "${base.lessonTitle}"`,
		);
	});

	/**
	 * The security-relevant half. Every admitted name lands inside an untrusted
	 * region of a prompt that runs before the first token of every turn, and
	 * `lessonInsights.concepts` is LLM-generated with a loose upper bound — a
	 * lesson that extracted forty concepts would otherwise pay for them on every
	 * turn and widen the injection surface with them.
	 */
	it("bounds how many concepts reach the classifier", () => {
		const many = Array.from({ length: 40 }, (_, i) => `Concept ${i}`);

		const domain = lessonGuardDomain({ ...base, concepts: many });

		expect(domain.description).toContain("Concept 0");
		expect(domain.description).toContain(`Concept ${MAX_DOMAIN_CONCEPTS - 1}`);
		expect(domain.description).not.toContain(`Concept ${MAX_DOMAIN_CONCEPTS}`);
	});
});
