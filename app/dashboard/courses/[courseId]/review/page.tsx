import { redirect } from "next/navigation";
import { api } from "@/trpc/server";
import ReviewForm from "./components/ReviewForm";
import ReviewReadOnly from "./components/ReviewReadOnly";

const ReviewCoursePage = async ({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) => {
	const { courseId } = await params;
	const eligibility = await api.review.getEligibility({ courseId });

	if (eligibility.state === "ineligible") {
		redirect(`/dashboard/browse/${courseId}`);
	}

	if (eligibility.state === "alreadyReviewed") {
		return (
			<ReviewReadOnly course={eligibility.course} review={eligibility.review} />
		);
	}

	return <ReviewForm course={eligibility.course} />;
};

export default ReviewCoursePage;
