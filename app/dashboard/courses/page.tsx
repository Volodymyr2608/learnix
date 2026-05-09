import { MyCourses } from "@/app/_components/Course/components/MyCourses";
import { TABS } from "@/app/_components/Course/components/MyCourses/constants";
import type { Tab } from "@/app/_components/Course/components/MyCourses/types";
import getStudentEnrolledCourses from "@/lib/requests/course/getStudentEnrolledCourses";

const MyCoursesPage = async ({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; page?: string }>;
}) => {
	const { tab = "all", page = "1" } = await searchParams;
	const currentTab = (TABS.some((t) => t.value === tab) ? tab : "all") as Tab;
	const currentPage = Math.max(1, Number(page) || 1);

	const { courses, total } = await getStudentEnrolledCourses({
		tab: currentTab,
		page: currentPage,
	});

	return (
		<MyCourses
			courses={courses}
			currentPage={currentPage}
			currentTab={currentTab}
			total={total}
		/>
	);
};

export default MyCoursesPage;
