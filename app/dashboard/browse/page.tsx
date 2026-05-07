import BrowseCourses from "@/app/_components/Course/components/BrowseCourses";
import { CoursePagination } from "@/app/_components/Course/components/CoursePagination";
import { getPublishedCourses } from "@/lib/requests/course/getPublishedCourses";
import getStudentEnrolledCourses from "@/lib/requests/course/getStudentEnrolledCourses";

const PAGE_SIZE = 9;

const BrowseCoursesPage = async ({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) => {
	const { q, category, page = "1" } = await searchParams;
	const currentPage = Math.max(1, Number(page) || 1);
	const currentCategory = category && category !== "all" ? category : undefined;

	const [{ courses, total }, { courses: enrolledCourses }] = await Promise.all([
		getPublishedCourses({ q, category: currentCategory, page: currentPage }),
		getStudentEnrolledCourses(),
	]);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const safePage = Math.min(currentPage, totalPages);

	const enrolledMap: Record<string, string | null> = {};
	for (const c of enrolledCourses) {
		enrolledMap[c.id] = c.nextLessonId;
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl tracking-tight">Browse Courses</h1>
				<p className="text-muted-foreground">
					Discover new skills and expand your knowledge
				</p>
			</div>

			<BrowseCourses
				category={category ?? "all"}
				courses={courses}
				enrolledMap={enrolledMap}
				q={q ?? ""}
			/>

			{totalPages > 1 && (
				<CoursePagination
					buildHref={(p) => {
						const params = new URLSearchParams();
						if (q) params.set("q", q);
						if (currentCategory) params.set("category", currentCategory);
						if (p > 1) params.set("page", String(p));
						const qs = params.toString();
						return `/dashboard/browse${qs ? `?${qs}` : ""}`;
					}}
					currentPage={safePage}
					totalPages={totalPages}
				/>
			)}
		</div>
	);
};

export default BrowseCoursesPage;
