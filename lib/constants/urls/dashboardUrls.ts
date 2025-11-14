const MAIN_URL = "/dashboard";

const DASHBOARD_URLS = {
	dashboard: MAIN_URL,
	courses: `${MAIN_URL}/courses`,
	createCourse: `${MAIN_URL}/courses/new`,
	previewCourse: (id: string) => `${MAIN_URL}/courses/${id}/preview`,
	editCourse: (id: string) => `${MAIN_URL}/courses/${id}/edit`,
};

export default DASHBOARD_URLS;
