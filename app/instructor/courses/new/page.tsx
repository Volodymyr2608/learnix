import WithAuthProtection from "@/app/_components/_shared/WithAuthProtection";
import CourseBuilder from "@/app/_components/Course/components/CourseBuilder";

export default function InstructorNewCoursePage() {
	return (
		<WithAuthProtection>
			<CourseBuilder mode="create" />
		</WithAuthProtection>
	);
}
