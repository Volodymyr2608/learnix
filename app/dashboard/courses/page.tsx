import { BookOpen, Clock, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card, CardContent } from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import getStudentEnrolledCourses from "@/lib/requests/course/getStudentEnrolledCourses";
import { cn } from "@/lib/utils/cn";
import CoursePagination from "./_components/CoursePagination";

const PAGE_SIZE = 9;

const TABS = [
	{ label: "All Courses", value: "all" },
	{ label: "In Progress", value: "in-progress" },
	{ label: "Completed", value: "completed" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const MyCoursesPage = async ({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; page?: string }>;
}) => {
	const { tab = "all", page = "1" } = await searchParams;
	const currentTab = (TABS.some((t) => t.value === tab) ? tab : "all") as Tab;
	const currentPage = Math.max(1, Number(page) || 1);

	const allCourses = await getStudentEnrolledCourses();

	const filtered =
		currentTab === "all"
			? allCourses
			: allCourses.filter((c) =>
					currentTab === "completed"
						? c.status === "Completed"
						: c.status === "In Progress",
				);

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const safePage = Math.min(currentPage, totalPages);
	const courses = filtered.slice(
		(safePage - 1) * PAGE_SIZE,
		safePage * PAGE_SIZE,
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl tracking-tight">My Courses</h1>
					<p className="text-muted-foreground">
						Manage and continue your learning journey
					</p>
				</div>
				<Button asChild>
					<Link href="/dashboard/browse">Browse More Courses</Link>
				</Button>
			</div>

			<div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
				{TABS.map((t) => (
					<Link
						className={cn(
							"inline-flex h-[calc(100%-1px)] items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1 font-medium text-sm transition-colors",
							currentTab === t.value
								? "border-input bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
						href={`/dashboard/courses?tab=${t.value}&page=1`}
						key={t.value}
					>
						{t.label}
					</Link>
				))}
			</div>

			{courses.length === 0 ? (
				<p className="text-muted-foreground text-sm">No courses found.</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{courses.map((course) => (
						<Card className="overflow-hidden" key={course.id}>
							<div className="relative h-[180px] w-full overflow-hidden bg-muted">
								<Image
									alt={course.title}
									className="object-cover"
									fill
									src={course.thumbnail || "/placeholder.svg"}
								/>
							</div>
							<CardContent className="space-y-3 p-3">
								<div className="flex items-start justify-between gap-2">
									<p className="line-clamp-1 font-medium text-sm leading-snug">
										{course.title}
									</p>
									<Badge
										className="shrink-0 text-xs"
										variant={
											course.status === "Completed" ? "default" : "secondary"
										}
									>
										{course.status === "Completed" ? "Done" : "Active"}
									</Badge>
								</div>

								<div className="space-y-1">
									<div className="flex justify-between text-muted-foreground text-xs">
										<span>
											{course.completedLessons}/{course.totalLessons} lessons
										</span>
										<span>{course.progress}%</span>
									</div>
									<Progress className="h-1.5" value={course.progress} />
								</div>

								<div className="flex items-center gap-1 text-muted-foreground text-xs">
									<Clock className="h-3 w-3" />
									<span>{course.duration}</span>
									<BookOpen className="ml-auto h-3 w-3" />
									<span>{course.totalLessons}</span>
								</div>

								<Button
									asChild
									className="h-7 w-full text-xs"
									size="sm"
									variant={
										course.status === "Completed" ? "outline" : "default"
									}
								>
									<Link
										href={
											course.status === "Completed"
												? `/dashboard/courses/${course.id}/review`
												: course.nextLessonId
													? `/dashboard/courses/${course.id}/learn/${course.nextLessonId}`
													: `/dashboard/courses/${course.id}/learn`
										}
									>
										<PlayCircle className="mr-1 h-3 w-3" />
										{course.status === "Completed" ? "Review" : "Continue"}
									</Link>
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{totalPages > 1 && (
				<CoursePagination
					currentPage={safePage}
					tab={currentTab}
					totalPages={totalPages}
				/>
			)}
		</div>
	);
};

export default MyCoursesPage;
