/** Per-course stats for the edit-course sidebar card (instructor's own course). */
export type OwnCourseStats = {
	students: number;
	averageRating: number | null; // null when the course has no reviews yet
	reviewsCount: number;
	revenueCents: number;
};

/** All data needed to render the four "My Courses" stat cards (instructor courses page). */
export type CourseOwnerStats = {
	total: number;
	draft: number;
	published: number;
	lastCourses: number;
	students: {
		total: number;
		newThisMonth: number;
	};
	revenue: {
		lifetimeGrossCents: number;
		thisMonthGrossCents: number;
	};
};
