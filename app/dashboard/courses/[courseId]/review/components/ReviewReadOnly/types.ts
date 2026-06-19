import type {
	CourseSummary,
	ReviewView,
} from "@/server/entities/review/review.dto";

export type ReviewReadOnlyProps = {
	course: CourseSummary;
	review: ReviewView;
};
