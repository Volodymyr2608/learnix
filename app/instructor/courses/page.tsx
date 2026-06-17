import { Plus } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { Button } from "@/app/_components/_shared/ui/button";
import OwnCourses from "@/app/_components/Course/components/OwnCourses";
import OwnCoursesStats from "@/app/_components/Course/components/OwnCoursesStats";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";

const CoursesPage = () => {
	return (
		<PageShell
			action={
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.createCourse}>
						<Plus className="mr-2 h-4 w-4" />
						Create New Course
					</Link>
				</Button>
			}
			description="Manage and track your courses"
			title="My Courses"
		>
			<OwnCoursesStats />
			<OwnCourses />
		</PageShell>
	);
};

export default CoursesPage;
