import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import WithAuthProtection from "@/app/_components/_shared/WithAuthProtection";
import OwnCourses from "@/app/_components/Course/components/OwnCourses";
import OwnCoursesStats from "@/app/_components/Course/components/OwnCoursesStats";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";

const CoursesPage = () => {
	return (
		<WithAuthProtection>
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="font-bold text-3xl tracking-tight">My Courses</h1>
						<p className="text-muted-foreground">
							Manage and track your courses
						</p>
					</div>
					<Button asChild>
						<Link href={INSTRUCTOR_URLS.createCourse}>
							<Plus className="mr-2 h-4 w-4" />
							Create New Course
						</Link>
					</Button>
				</div>

				<OwnCoursesStats />
				<OwnCourses />
			</div>
		</WithAuthProtection>
	);
};

export default CoursesPage;
