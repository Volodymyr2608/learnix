import { Search } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Input } from "@/app/_components/_shared/ui/input";
import CourseCard from "@/app/_components/Course/CourseCard";
import { api } from "@/trpc/server";

const OwnCourses = async () => {
	const courses = await api.course.getOwnCourses(undefined);

	return (
		<>
			<div className="flex gap-4">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
					<Input className="pl-10" placeholder="Search your courses..." />
				</div>
				<Button variant="outline">All Status</Button>
				<Button variant="outline">Sort By</Button>
			</div>

			{/* Courses Grid */}
			<div className="grid gap-6 md:grid-cols-3">
				{courses.map((course) => (
					<CourseCard course={course} key={course.id} />
				))}
			</div>
		</>
	);
};

export default OwnCourses;
