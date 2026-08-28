import { randomUUID } from "node:crypto";
import {
	CourseStatus,
	EnrollmentStatus,
	type Prisma,
	Role,
} from "@/generated/prisma";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
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

export function makeQuiz(
	overrides: Partial<Prisma.QuizUncheckedCreateInput> & { lessonId: string },
) {
	return testDb.quiz.create({
		data: {
			question: "What is a base case?",
			options: ["A", "B"],
			correct: "A",
			...overrides,
		},
	});
}

export function makeQuizAttempt(
	overrides: Partial<Prisma.QuizAttemptUncheckedCreateInput> & {
		quizId: string;
		studentId: string;
	},
) {
	return testDb.quizAttempt.create({
		data: { selectedAnswer: "A", isCorrect: true, ...overrides },
	});
}

export function makeLessonInsights(
	overrides: Partial<Prisma.LessonInsightsUncheckedCreateInput> & {
		lessonId: string;
	},
) {
	return testDb.lessonInsights.create({
		data: {
			summary: "Test summary",
			concepts: [
				{ name: "Recursion", explanation: "A function calling itself" },
			],
			glossary: [],
			model: "test-model",
			contentHash: "test-hash",
			...overrides,
		},
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
		// Derived rather than required of every caller, so a seeded row can never
		// carry a key that disagrees with its own spelling.
		data: { level: 0, conceptKey: conceptKey(overrides.concept), ...overrides },
	});
}

export function makeInstructorProfile(
	overrides: Partial<Prisma.InstructorProfileUncheckedCreateInput> & {
		userId: string;
	},
) {
	return testDb.instructorProfile.create({
		data: {
			areaOfExpertise: "Software Engineering",
			teachingExperience: "5 years",
			professionalBio: "I have taught backend engineering since 2019.",
			courseIdea: "A course on distributed systems",
			...overrides,
		},
	});
}

export function makePayment(
	overrides: Partial<Prisma.PaymentUncheckedCreateInput> & {
		studentId: string;
		instructorId: string;
		courseId: string;
	},
) {
	return testDb.payment.create({
		data: {
			amountCents: 4999,
			platformFeeCents: 1000,
			instructorNetCents: 3999,
			status: "succeeded",
			transferStatus: "none",
			...overrides,
		},
	});
}

export function makeCourseReview(
	overrides: Partial<Prisma.CourseReviewUncheckedCreateInput> & {
		courseId: string;
		studentId: string;
	},
) {
	return testDb.courseReview.create({
		data: { rating: 5, comment: "Excellent course.", ...overrides },
	});
}

export function makeConversation(
	overrides: Partial<Prisma.ConversationUncheckedCreateInput> & {
		studentId: string;
		instructorId: string;
		courseId: string;
	},
) {
	return testDb.conversation.create({ data: { ...overrides } });
}

export function makeMessage(
	overrides: Partial<Prisma.MessageUncheckedCreateInput> & {
		conversationId: string;
		senderId: string;
	},
) {
	return testDb.message.create({
		data: { body: "Hello, I have a question about lesson 2.", ...overrides },
	});
}
