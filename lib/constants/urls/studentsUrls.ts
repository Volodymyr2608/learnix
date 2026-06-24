const MAIN_URL = "/dashboard";

const STUDENT_URLS = {
	dashboard: MAIN_URL,
	courses: `${MAIN_URL}/courses`,
	learnCourse: (courseId: string) => `${MAIN_URL}/courses/${courseId}/learn`,
	learnLesson: (courseId: string, lessonId: string) =>
		`${MAIN_URL}/courses/${courseId}/learn/${lessonId}`,
	browseCourse: `${MAIN_URL}/browse`,
	courseDetail: (id: string) => `${MAIN_URL}/browse/${id}`,
	progress: `${MAIN_URL}/progress`,
	certificates: `${MAIN_URL}/certificates`,
	messages: `${MAIN_URL}/messages`,
	messageThread: (conversationId: string) =>
		`${MAIN_URL}/messages?c=${conversationId}`,
	billing: `${MAIN_URL}/billing`,
	settings: `${MAIN_URL}/settings`,
	profile: "/profile",
	accountSettings: "/settings",
};

export default STUDENT_URLS;
