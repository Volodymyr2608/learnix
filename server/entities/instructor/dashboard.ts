/** Month-over-month change for a stat card. */
export type StatDelta =
	| { kind: "percent"; value: number; direction: "up" | "down" | "flat" }
	| { kind: "new" } // prior period 0, current > 0
	| { kind: "none" }; // nothing to compare (both periods 0)

/** All data needed to render the four instructor dashboard stat cards. */
export type DashboardStats = {
	revenue: { totalCents: number; delta: StatDelta };
	students: { total: number; delta: StatDelta };
	courses: { published: number; drafts: number };
	rating: { average: number | null; reviewCount: number };
};

/** One row of the "Top Performing Courses" card (FR1, FR2). */
export type TopCourse = {
	courseId: string;
	title: string;
	students: number; // active enrollments = distinct students (FR4)
	rating: number | null; // avg review rating; null = no reviews yet → "—" (FR5)
	grossCents: number; // lifetime gross revenue, ranking key (FR2)
};

/** One entry in the "Recent Activity" feed (FR7–FR10). Discriminated by `type`. */
export type ActivityEvent =
	| {
			type: "enrollment";
			id: string; // enrollment id (stable React key)
			studentName: string;
			courseTitle: string;
			occurredAt: Date; // Enrollment.enrolledAt
	  }
	| {
			type: "review";
			id: string; // review id
			studentName: string;
			courseTitle: string;
			rating: number; // 1..5
			occurredAt: Date; // CourseReview.createdAt
	  };
