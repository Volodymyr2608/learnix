import type { OwnCoursesQueryState } from "../types";

/** Non-page query params for a query state, dropping defaults. Serializable for passing to a Client Component. */
export function buildOwnCoursesQueryParams(
	query: OwnCoursesQueryState,
): Record<string, string> {
	const params: Record<string, string> = {};
	if (query.q) params.q = query.q;
	if (query.status !== "all") params.status = query.status;
	if (query.category && query.category !== "all") params.category = query.category;
	if (query.sort !== "updated") params.sort = query.sort;
	return params;
}

/** Build the canonical /instructor/courses href for a query state, dropping defaults. */
export function buildOwnCoursesHref(query: OwnCoursesQueryState): string {
	const params = new URLSearchParams(buildOwnCoursesQueryParams(query));
	if (query.page > 1) params.set("page", String(query.page));
	const qs = params.toString();
	return `/instructor/courses${qs ? `?${qs}` : ""}`;
}