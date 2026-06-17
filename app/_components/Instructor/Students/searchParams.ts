import type { GetStudentsInput } from "@/server/entities/instructor/students";
import type { StudentsQueryState } from "./types";

type RawSearchParams = Record<string, string | string[] | undefined>;

const STATUSES = ["all", "active", "completed", "inactive"] as const;
const SORTS = ["recent", "name", "progress"] as const;

const DEFAULT_STATUS: StudentsQueryState["status"] = "all";
const DEFAULT_SORT: StudentsQueryState["sort"] = "recent";

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function asStatus(value: string | undefined): StudentsQueryState["status"] {
	return STATUSES.includes(value as StudentsQueryState["status"])
		? (value as StudentsQueryState["status"])
		: DEFAULT_STATUS;
}

function asSort(value: string | undefined): StudentsQueryState["sort"] {
	return SORTS.includes(value as StudentsQueryState["sort"])
		? (value as StudentsQueryState["sort"])
		: DEFAULT_SORT;
}

function asPage(value: string | undefined): number {
	const page = Number.parseInt(value ?? "", 10);
	return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** Parse raw URL search params into the page's controlled query state. */
export function parseStudentsSearchParams(
	sp: RawSearchParams,
): StudentsQueryState {
	return {
		q: first(sp.q)?.slice(0, 200) ?? "",
		status: asStatus(first(sp.status)),
		courseId: first(sp.courseId) ?? "all",
		sort: asSort(first(sp.sort)),
		page: asPage(first(sp.page)),
	};
}

/** Shape the controlled query state into the tRPC `getStudents` input. */
export function toStudentsInput(query: StudentsQueryState): GetStudentsInput {
	return {
		q: query.q.trim() || undefined,
		status: query.status,
		courseId: query.courseId === "all" ? undefined : query.courseId,
		sort: query.sort,
		page: query.page,
	};
}
