import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";
import { api } from "@/trpc/server";

export const getRecommendations = async (): Promise<PublishedCourse[]> => {
	try {
		return (await api.search.recommendations()) ?? [];
	} catch {
		return [];
	}
};
