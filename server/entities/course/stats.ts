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
