import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";
import type { OwnCoursesQueryState } from "./types";

type RawSearchParams = Record<string, string | string[] | undefined>;

const STATUSES = ["all", "draft", "published"] as const;
const SORTS = ["updated", "newest", "oldest", "title", "students"] as const;

const DEFAULT_STATUS: OwnCoursesQueryState["status"] = "all";
const DEFAULT_SORT: OwnCoursesQueryState["sort"] = "updated";

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function asStatus(value: string | undefined): OwnCoursesQueryState["status"] {
	return STATUSES.includes(value as OwnCoursesQueryState["status"])
		? (value as OwnCoursesQueryState["status"])
		: DEFAULT_STATUS;
}

function asSort(value: string | undefined): OwnCoursesQueryState["sort"] {
	return SORTS.includes(value as OwnCoursesQueryState["sort"])
		? (value as OwnCoursesQueryState["sort"])
		: DEFAULT_SORT;
}

function asPage(value: string | undefined): number {
	const page = Number.parseInt(value ?? "", 10);
	return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** Parse raw URL search params into the page's controlled query state. */
export function parseOwnCoursesSearchParams(
	sp: RawSearchParams,
): OwnCoursesQueryState {
	return {
		q: first(sp.q)?.slice(0, 200) ?? "",
		status: asStatus(first(sp.status)),
		category: first(sp.category) ?? "all",
		sort: asSort(first(sp.sort)),
		page: asPage(first(sp.page)),
	};
}

/** Shape the controlled query state into the tRPC `searchOwnCourses` input. */
export function toSearchInput(query: OwnCoursesQueryState): GetOwnCoursesInput {
	return {
		q: query.q.trim() || undefined,
		status: query.status,
		category: query.category === "all" ? undefined : query.category,
		sort: query.sort,
		page: query.page,
	};
}
