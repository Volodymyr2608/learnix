export const COURSE_CATEGORIES = [
	{ value: "development", label: "Development" },
	{ value: "design", label: "Design" },
	{ value: "business", label: "Business" },
	{ value: "marketing", label: "Marketing" },
	{ value: "data-science", label: "Data Science" },
] as const;

export type CourseCategoryValue = (typeof COURSE_CATEGORIES)[number]["value"];

/** Values only — what the AI tool returns. */
export const COURSE_CATEGORY_VALUES: readonly CourseCategoryValue[] =
	COURSE_CATEGORIES.map((c) => c.value);
