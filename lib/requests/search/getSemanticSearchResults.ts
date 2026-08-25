import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";
import { api } from "@/trpc/server";

export type SemanticSearchResult = PublishedCourse;

export const getSemanticSearchResults = async (params: {
	query: string;
	category?: string;
	level?: string;
}): Promise<SemanticSearchResult[]> => {
	return safeRequest("search.getSemanticSearchResults", async () => {
		const results = await api.search.semantic({
			query: params.query,
			category: params.category,
			level: params.level,
		});
		return results ?? [];
	}, []);
};
