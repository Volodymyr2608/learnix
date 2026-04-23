import BrowseCourses from "@/app/_components/Course/components/BrowseCourses";
import { getPublishedCourses } from "@/app/_components/Course/components/BrowseCourses/actions/getPublishedCourses";

const BrowseCoursesPage = async () => {
	const courses = await getPublishedCourses();

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div>
				<h1 className="font-bold text-3xl tracking-tight">Browse Courses</h1>
				<p className="text-muted-foreground">
					Discover new skills and expand your knowledge
				</p>
			</div>

			<BrowseCourses initialCourses={courses} />
		</div>
	);
};

export default BrowseCoursesPage;
