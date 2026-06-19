import type { ReviewTag } from "@/generated/prisma";
import type { CourseSummary } from "@/server/entities/review/review.dto";

export type ReviewFormProps = {
	course: CourseSummary;
};

export type TagOption = {
	value: ReviewTag;
	label: string;
};
