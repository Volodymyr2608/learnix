import { redirect } from "next/navigation";
import CourseAnalytics from "@/app/_components/Instructor/CourseAnalytics";
import { Role } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";

export default async function CourseAnalyticsPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const session = await getSession();
	if (!session?.user) redirect("/sign-in");
	if (session.user.role !== Role.INSTRUCTOR) redirect("/dashboard");

	const { courseId } = await params;
	return <CourseAnalytics courseId={courseId} />;
}
