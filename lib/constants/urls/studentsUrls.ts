const MAIN_URL = "/dashboard";

const STUDENT_URLS = {
	dashboard: MAIN_URL,
	courses: `${MAIN_URL}/courses`,
	browseCourse: `${MAIN_URL}/browse`,
	courseDetail: (id: string) => `${MAIN_URL}/browse/${id}`,
	progress: `${MAIN_URL}/progress`,
	messages: `${MAIN_URL}/messages`,
	billing: `${MAIN_URL}/billing`,
	settings: `${MAIN_URL}/settings`,
	profile: "/profile",
	accountSettings: "/settings",
};

export default STUDENT_URLS;
