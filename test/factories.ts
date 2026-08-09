import { randomUUID } from "node:crypto";
import {
	CourseStatus,
	EnrollmentStatus,
	type Prisma,
	Role,
} from "@/generated/prisma";
import { testDb } from "./db";

export function makeUser(
	overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
	return testDb.user.create({
		data: {
			name: "Test User",
			email: `${randomUUID()}@example.com`,
			emailVerified: false,
			role: Role.STUDENT,
			...overrides,
		},
	});
}

export function makeCourse(
	overrides: Partial<Prisma.CourseUncheckedCreateInput> & {
		instructorId: string;
	},
) {
	return testDb.course.create({
		data: {
			title: "Test Course",
			description: "Test course description",
			category: "Technology",
			level: "Beginner",
			language: "English",
			duration: "2 hours",
			priceCents: 0,
			status: CourseStatus.draft,
			...overrides,
		},
	});
}

export function makeSection(
	overrides: Partial<Prisma.SectionUncheckedCreateInput> & {
		courseId: string;
	},
) {
	return testDb.section.create({
		data: { title: "Section 1", order: 0, ...overrides },
	});
}

export function makeLesson(
	overrides: Partial<Prisma.LessonUncheckedCreateInput> & {
		sectionId: string;
	},
) {
	return testDb.lesson.create({
		data: { title: "Lesson 1", order: 0, ...overrides },
	});
}

export function makeEnrollment(
	overrides: Partial<Prisma.EnrollmentUncheckedCreateInput> & {
		studentId: string;
		courseId: string;
	},
) {
	return testDb.enrollment.create({
		data: { status: EnrollmentStatus.active, ...overrides },
	});
}

export function makeLessonProgress(
	overrides: Partial<Prisma.LessonProgressUncheckedCreateInput> & {
		lessonId: string;
		studentId: string;
	},
) {
	return testDb.lessonProgress.create({
		data: { isCompleted: false, ...overrides },
	});
}

export function makeConceptMastery(
	overrides: Partial<Prisma.ConceptMasteryUncheckedCreateInput> & {
		studentId: string;
		courseId: string;
		concept: string;
	},
) {
	return testDb.conceptMastery.create({
		data: { level: 0, ...overrides },
	});
}
