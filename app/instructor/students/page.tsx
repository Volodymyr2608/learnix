import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { StudentsFilters } from "@/app/_components/Instructor/Students/StudentsFilters";
import { StudentsResults } from "@/app/_components/Instructor/Students/StudentsResults";
import { StudentsStatsCards } from "@/app/_components/Instructor/Students/StudentsStatsCards";
import {
	parseStudentsSearchParams,
	toStudentsInput,
} from "@/app/_components/Instructor/Students/searchParams";
import getOwnCourses from "@/lib/requests/instructor/getOwnCourses";
import getStudentStatusCounts from "@/lib/requests/instructor/getStudentStatusCounts";
import getStudents from "@/lib/requests/instructor/getStudents";

type InstructorStudentsPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstructorStudentsPage({
	searchParams,
}: InstructorStudentsPageProps) {
	const query = parseStudentsSearchParams(await searchParams);

	const [counts, courses, students] = await Promise.all([
		getStudentStatusCounts(),
		getOwnCourses(),
		getStudents(toStudentsInput(query)),
	]);

	return (
		<PageShell
			description="Manage and track your students' progress"
			title="Students"
		>
			<StudentsStatsCards counts={counts} />
			<StudentsFilters
				courses={courses.map((c) => ({ id: c.id, title: c.title }))}
				query={query}
			/>
			<StudentsResults students={students} />
		</PageShell>
	);
}
