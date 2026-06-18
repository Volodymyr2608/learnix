import type { OwnCoursesQueryState } from "../types";

/** Build the canonical /instructor/courses href for a query state, dropping defaults. */
export function buildOwnCoursesHref(query: OwnCoursesQueryState): string {
	const params = new URLSearchParams();
	if (query.q) params.set("q", query.q);
	if (query.status !== "all") params.set("status", query.status);
	if (query.category && query.category !== "all")
		params.set("category", query.category);
	if (query.sort !== "updated") params.set("sort", query.sort);
	if (query.page > 1) params.set("page", String(query.page));
	const qs = params.toString();
	return `/instructor/courses${qs ? `?${qs}` : ""}`;
}
