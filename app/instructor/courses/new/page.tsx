import WithAuthProtection from "@/app/_components/_shared/WithAuthProtection";
import CreateCourse from "@/app/_components/Course/CreateCourse";

export default function InstructorNewCoursePage() {
	return (
		<WithAuthProtection>
			<CreateCourse />
		</WithAuthProtection>
	);
}
