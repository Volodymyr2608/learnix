import { z } from "zod";
import type { CourseStatus } from "@/generated/prisma";

export const getOwnCoursesInput = z.object({
	q: z.string().trim().max(200).optional(),
	status: z.enum(["all", "draft", "published"]).default("all"),
	category: z.string().optional(),
	sort: z
		.enum(["updated", "newest", "oldest", "title", "students"])
		.default("updated"),
	page: z.number().int().min(1).default(1),
});

export type GetOwnCoursesInput = z.infer<typeof getOwnCoursesInput>;

export type OwnCourseRow = {
	id: string;
	title: string;
	status: CourseStatus;
	updatedAt: Date;
	thumbnailUrl: string | null;
};

export type PaginatedOwnCourses = {
	data: OwnCourseRow[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
};
