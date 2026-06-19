const MAIN_URL = "/instructor";

const INSTRUCTOR_URLS = {
	dashboard: MAIN_URL,
	courses: `${MAIN_URL}/courses`,
	reviews: `${MAIN_URL}/reviews`,
	createCourse: `${MAIN_URL}/courses/new`,
	previewCourse: (id: string) => `${MAIN_URL}/courses/${id}/preview`,
	editCourse: (id: string) => `${MAIN_URL}/courses/${id}/edit`,
	previewLesson: (courseId: string, lessonId: string) =>
		`${MAIN_URL}/courses/${courseId}/lessons/${lessonId}/preview`,
	editLesson: (courseId: string, lessonId: string) =>
		`${MAIN_URL}/courses/${courseId}/lessons/${lessonId}`,
	profile: "/profile",
	accountSettings: "/settings",
};

export default INSTRUCTOR_URLS;
