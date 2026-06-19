import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { ReviewsFilters } from "@/app/_components/Instructor/Reviews/ReviewsFilters";
import { ReviewsResults } from "@/app/_components/Instructor/Reviews/ReviewsResults";
import { ReviewsStats } from "@/app/_components/Instructor/Reviews/ReviewsStats";
import {
	parseReviewsSearchParams,
	toReviewsInput,
	toStatsInput,
} from "@/app/_components/Instructor/Reviews/searchParams";
import getReviewCourseOptions from "@/lib/requests/instructor/getReviewCourseOptions";
import getReviewStats from "@/lib/requests/instructor/getReviewStats";
import getReviews from "@/lib/requests/instructor/getReviews";

type InstructorReviewsPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstructorReviewsPage({
	searchParams,
}: InstructorReviewsPageProps) {
	const query = parseReviewsSearchParams(await searchParams);

	const [courses, stats, reviews] = await Promise.all([
		getReviewCourseOptions(),
		getReviewStats(toStatsInput(query)),
		getReviews(toReviewsInput(query)),
	]);

	return (
		<PageShell
			action={<ReviewsFilters courses={courses} query={query} />}
			description="See what students think of your courses."
			title="Reviews"
		>
			<ReviewsStats stats={stats} />
			<ReviewsResults query={query} reviews={reviews} />
		</PageShell>
	);
}
