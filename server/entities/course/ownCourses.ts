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

export type Paginated<T> = {
	data: T[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
};

export type OwnCourseRow = {
	id: string;
	title: string;
	status: CourseStatus;
	updatedAt: Date;
	thumbnailUrl: string | null;
	students: number; // active + completed enrollments (FR1)
	rating: number | null; // avg review rating; null = no reviews yet → "—" (FR2)
	revenueCents: number; // lifetime gross revenue; 0 if no payments yet (FR3)
};

/** What `courseRepository.searchOwnCourses` can produce in a single query — rating and
 * revenue come from separate tables and are merged in by the service (Task 4). */
export type OwnCourseRepoRow = Omit<OwnCourseRow, "rating" | "revenueCents">;

export type PaginatedOwnCourses = Paginated<OwnCourseRow>;
