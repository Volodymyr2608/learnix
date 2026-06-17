import {
	type Enrollment,
	EnrollmentStatus,
	type Prisma,
} from "@/generated/prisma";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import type {
	StudentCourseProgress,
	StudentStatus,
} from "@/server/entities/instructor/students";
import { BaseRepository } from "./base/base.repository";

export type FindInstructorStudentsParams = {
	instructorId: string;
	cutoff: Date;
	q?: string;
	status: "all" | StudentStatus;
	courseId?: string;
	sort: "recent" | "name" | "progress";
	page: number;
	perPage: number;
};

export type RawStudentRow = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	progress: number;
	last_active_at: Date | null;
	joined_at: Date;
	status: StudentStatus;
	courses: StudentCourseProgress[];
};

class EnrollmentRepository extends BaseRepository<
	"enrollment",
	Enrollment,
	Prisma.EnrollmentUncheckedCreateInput,
	Prisma.EnrollmentUpdateInput,
	Prisma.EnrollmentWhereInput,
	Prisma.EnrollmentInclude,
	Prisma.EnrollmentSelect,
	Prisma.EnrollmentOrderByWithRelationInput
> {
	protected readonly modelName = "enrollment" as const;

	async findEnrolledCourseIds(userId: string): Promise<string[]> {
		const rows = await this.findMany({
			where: {
				studentId: userId,
				status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
			},
			select: { courseId: true },
		});
		return rows.map((r) => (r as { courseId: string }).courseId);
	}

	findByIdWithRelations(enrollmentId: string) {
		return this.findFirst({
			where: { id: enrollmentId },
			include: {
				student: {
					select: {
						id: true,
						email: true,
						name: true,
						emailNotificationsEnabled: true,
					},
				},
				course: {
					include: {
						instructor: { select: { name: true } },
					},
				},
			},
		});
	}

	findActiveWithLessons() {
		return this.findMany({
			where: {
				status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
				course: { deletedAt: null, status: "published" },
			},
			include: {
				student: {
					select: {
						id: true,
						email: true,
						name: true,
						emailNotificationsEnabled: true,
					},
				},
				course: {
					include: {
						sections: {
							where: { deletedAt: null },
							orderBy: { order: "asc" },
							include: {
								lessons: {
									where: { deletedAt: null },
									orderBy: { order: "asc" },
									select: { id: true, title: true },
								},
							},
						},
					},
				},
			},
		});
	}

	findByStudentCourseWithRelations(studentId: string, courseId: string) {
		return this.findFirst({
			where: { studentId, courseId },
			include: {
				student: {
					select: {
						email: true,
						name: true,
						emailNotificationsEnabled: true,
					},
				},
				course: { select: { id: true, title: true } },
			},
		});
	}

	findByStudentCourse(studentId: string, courseId: string) {
		return this.findFirst({
			where: {
				studentId,
				courseId,
				status: { not: EnrollmentStatus.cancelled },
			},
			include: { course: { select: { deletedAt: true, status: true } } },
		});
	}

	async findRecentByInstructor(
		instructorId: string,
		take: number,
	): Promise<
		{
			id: string;
			studentName: string;
			courseTitle: string;
			enrolledAt: Date;
		}[]
	> {
		const rows = await this.findMany({
			where: {
				status: EnrollmentStatus.active,
				course: { is: { instructorId, deletedAt: null } },
			},
			orderBy: { enrolledAt: "desc" },
			take,
			select: {
				id: true,
				enrolledAt: true,
				student: { select: { name: true } },
				course: { select: { title: true } },
			},
		});
		return rows.map((r) => ({
			id: r.id,
			studentName: r.student.name,
			courseTitle: r.course.title,
			enrolledAt: r.enrolledAt,
		}));
	}

	async findInstructorStudents(
		params: FindInstructorStudentsParams,
	): Promise<{ rows: RawStudentRow[]; total: number }> {
		const { instructorId, cutoff, q, status, courseId, sort, page, perPage } =
			params;

		// Prisma.sql fragment composition does not flatten reliably inside
		// $queryRaw under the Next.js bundler (nested Sql instances fail the
		// `instanceof` check and get bound as scalar params), so we build the
		// SQL string explicitly with positional placeholders and pass values
		// to $queryRawUnsafe — the same pattern used in embedding.repository.
		const queryParams: unknown[] = [];
		const bind = (value: unknown) => {
			queryParams.push(value);
			return `$${queryParams.length}`;
		};

		const instructorParam = bind(instructorId);
		const cutoffParam = bind(cutoff);
		const courseClause = courseId
			? `AND e."studentId" IN (SELECT "studentId" FROM enrollments WHERE "courseId" = ${bind(courseId)} AND status <> 'cancelled')`
			: "";

		const cte = `
			WITH student_rows AS (
				SELECT
					e."studentId" AS id,
					ROUND(AVG(e.progress))::int AS progress,
					MAX(e."lastAccessedAt") AS last_active_at,
					MIN(e."enrolledAt") AS joined_at,
					MAX(e."enrolledAt") AS recent_enrolled_at,
					bool_and(e.status = 'completed') AS all_completed,
					json_agg(
						json_build_object(
							'courseId', c.id,
							'title', c.title,
							'progress', e.progress,
							'completed', e.status = 'completed'
						) ORDER BY e."enrolledAt" DESC
					) AS courses
				FROM enrollments e
				JOIN courses c ON c.id = e."courseId"
				WHERE c."instructorId" = ${instructorParam}
					AND c.deleted_at IS NULL
					AND e.status <> 'cancelled'
					${courseClause}
				GROUP BY e."studentId"
			), enriched AS (
				SELECT
					s.id, s.progress, s.last_active_at, s.joined_at,
					s.recent_enrolled_at, s.courses,
					u.name, u.email, u.image,
					CASE
						WHEN s.all_completed THEN 'completed'
						WHEN s.last_active_at IS NULL OR s.last_active_at < ${cutoffParam} THEN 'inactive'
						ELSE 'active'
					END AS status
				FROM student_rows s
				JOIN users u ON u.id = s.id
			)
		`;

		const filterClauses: string[] = [];
		if (q) {
			const likeParam = bind(`%${q}%`);
			filterClauses.push(
				`AND (name ILIKE ${likeParam} OR email ILIKE ${likeParam})`,
			);
		}
		if (status !== "all") {
			filterClauses.push(`AND status = ${bind(status)}`);
		}
		const filterSql = filterClauses.join(" ");

		const orderBy =
			sort === "name"
				? "ORDER BY name ASC"
				: sort === "progress"
					? "ORDER BY progress DESC"
					: "ORDER BY recent_enrolled_at DESC";

		const countSql = `
			${cte}
			SELECT COUNT(*)::bigint AS count
			FROM enriched
			WHERE TRUE ${filterSql}
		`;
		const countParams = [...queryParams];

		const limitParam = bind(perPage);
		const offsetParam = bind((page - 1) * perPage);
		const dataSql = `
			${cte}
			SELECT id, name, email, image, progress, last_active_at, joined_at, status, courses
			FROM enriched
			WHERE TRUE ${filterSql}
			${orderBy}
			LIMIT ${limitParam} OFFSET ${offsetParam}
		`;

		const [rows, totalRows] = await Promise.all([
			this.db.$queryRawUnsafe<RawStudentRow[]>(dataSql, ...queryParams),
			this.db.$queryRawUnsafe<[{ count: bigint }]>(countSql, ...countParams),
		]);

		return { rows, total: Number(totalRows[0]?.count ?? 0) };
	}

	async getInstructorStudentStats(instructorId: string): Promise<{
		total: number;
		thisMonthNew: number;
		lastMonthNew: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const ownedActive = {
			status: EnrollmentStatus.active,
			course: { is: { instructorId, deletedAt: null } },
		};

		const [totalResult, thisMonthNew, lastMonthNew] = await Promise.all([
			this.db.$queryRaw<[{ cnt: bigint }]>`
				SELECT COUNT(DISTINCT "studentId") AS cnt
				FROM enrollments
				WHERE status = 'active'
				  AND "courseId" IN (
					SELECT id FROM courses
					WHERE "instructorId" = ${instructorId}
					  AND deleted_at IS NULL
				  )
			`,
			this.count({
				...ownedActive,
				enrolledAt: { gte: startThisMonth, lt: startNextMonth },
			}),
			this.count({
				...ownedActive,
				enrolledAt: { gte: startLastMonth, lt: startThisMonth },
			}),
		]);

		return {
			total: Number(totalResult[0]?.cnt ?? 0),
			thisMonthNew,
			lastMonthNew,
		};
	}

	async getInstructorStudentStatusCounts(
		instructorId: string,
		cutoff: Date,
	): Promise<{
		total: number;
		active: number;
		completed: number;
		inactive: number;
	}> {
		const rows = await this.db.$queryRaw<
			[{ total: bigint; active: bigint; completed: bigint; inactive: bigint }]
		>`
			WITH student_rows AS (
				SELECT
					e."studentId" AS id,
					MAX(e."lastAccessedAt") AS last_active_at,
					bool_and(e.status = 'completed') AS all_completed
				FROM enrollments e
				JOIN courses c ON c.id = e."courseId"
				WHERE c."instructorId" = ${instructorId}
					AND c.deleted_at IS NULL
					AND e.status <> 'cancelled'
				GROUP BY e."studentId"
			), enriched AS (
				SELECT
					CASE
						WHEN all_completed THEN 'completed'
						WHEN last_active_at IS NULL OR last_active_at < ${cutoff} THEN 'inactive'
						ELSE 'active'
					END AS status
				FROM student_rows
			)
			SELECT
				COUNT(*)::bigint AS total,
				COUNT(*) FILTER (WHERE status = 'active')::bigint AS active,
				COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed,
				COUNT(*) FILTER (WHERE status = 'inactive')::bigint AS inactive
			FROM enriched
		`;
		const r = rows[0];
		return {
			total: Number(r?.total ?? 0),
			active: Number(r?.active ?? 0),
			completed: Number(r?.completed ?? 0),
			inactive: Number(r?.inactive ?? 0),
		};
	}
}

export const enrollmentRepository = new EnrollmentRepository();
