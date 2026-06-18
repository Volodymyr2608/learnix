import CATEGORIES from "@/app/_components/Course/constants/categories";
import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";

export const STATUS_OPTIONS: {
	value: GetOwnCoursesInput["status"];
	label: string;
}[] = [
	{ value: "all", label: "All Status" },
	{ value: "published", label: "Published" },
	{ value: "draft", label: "Draft" },
];

export const SORT_OPTIONS: {
	value: GetOwnCoursesInput["sort"];
	label: string;
}[] = [
	{ value: "updated", label: "Recently updated" },
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "title", label: "Title A–Z" },
	{ value: "students", label: "Most students" },
];

// Value mirrors browse: "All" → "all" sentinel, otherwise the lowercased category.
export const CATEGORY_OPTIONS: { value: string; label: string }[] =
	CATEGORIES.map((cat) => ({
		value: cat === "All" ? "all" : cat.toLowerCase(),
		label: cat,
	}));
