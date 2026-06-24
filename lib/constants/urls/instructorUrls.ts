const MAIN_URL = "/instructor";

const INSTRUCTOR_URLS = {
	dashboard: MAIN_URL,
	courses: `${MAIN_URL}/courses`,
	students: `${MAIN_URL}/students`,
	revenue: `${MAIN_URL}/revenue`,
	reviews: `${MAIN_URL}/reviews`,
	analytics: `${MAIN_URL}/analytics`,
	messages: `${MAIN_URL}/messages`,
	messageThread: (conversationId: string) =>
		`${MAIN_URL}/messages?c=${conversationId}`,
	createCourse: `${MAIN_URL}/courses/new`,
	previewCourse: (id: string) => `${MAIN_URL}/courses/${id}/preview`,
	editCourse: (id: string) => `${MAIN_URL}/courses/${id}/edit`,
	courseAnalytics: (id: string) => `${MAIN_URL}/courses/${id}/analytics`,
	previewLesson: (courseId: string, lessonId: string) =>
		`${MAIN_URL}/courses/${courseId}/lessons/${lessonId}/preview`,
	editLesson: (courseId: string, lessonId: string) =>
		`${MAIN_URL}/courses/${courseId}/lessons/${lessonId}`,
	profile: "/profile",
	accountSettings: "/settings",
};

export default INSTRUCTOR_URLS;
