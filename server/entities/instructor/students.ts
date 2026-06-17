import { z } from "zod";

export type StudentStatus = "active" | "completed" | "inactive";

export type StudentCourseProgress = {
	courseId: string;
	title: string;
	progress: number; // 0..100, this enrollment
	completed: boolean; // enrollment.status === "completed"
};

export type StudentRow = {
	id: string; // user id
	name: string;
	email: string;
	image: string | null;
	courses: StudentCourseProgress[]; // this instructor's courses only
	overallProgress: number; // rounded average across courses
	lastActiveAt: Date | null; // max lastAccessedAt; null → "Never"
	joinedAt: Date; // min enrolledAt
	status: StudentStatus; // derived
};

export type PaginatedStudents = {
	data: StudentRow[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
};

export type StudentStatusCounts = {
	total: number;
	active: number;
	completed: number;
	inactive: number;
};

export const getStudentsInput = z.object({
	q: z.string().trim().max(200).optional(),
	status: z.enum(["all", "active", "completed", "inactive"]).default("all"),
	courseId: z.string().cuid().optional(),
	sort: z.enum(["recent", "name", "progress"]).default("recent"),
	page: z.number().int().min(1).default(1),
});

export type GetStudentsInput = z.infer<typeof getStudentsInput>;
