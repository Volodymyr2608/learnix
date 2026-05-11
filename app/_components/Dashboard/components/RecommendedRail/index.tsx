import BrowseCourseCard from "@/app/_components/Course/components/BrowseCourses/components/BrowseCourseCard";
import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";

type Props = {
	courses: PublishedCourse[];
};

const RecommendedRail = ({ courses }: Props) => {
	if (courses.length === 0) return null;

	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-xl">Recommended for you</h2>
				<p className="text-muted-foreground text-sm">
					Based on your enrolled courses
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{courses.map((course) => (
					<BrowseCourseCard
						course={course}
						isEnrolled={false}
						key={course.id}
						nextLessonId={null}
					/>
				))}
			</div>
		</div>
	);
};

export default RecommendedRail;
