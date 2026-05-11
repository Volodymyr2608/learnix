import { useState } from "react";
import type { LessonData } from "@/lib/requests/lesson/getLessonById";
import type { Resource } from "../types";

export const useLessonResources = (initialLesson: LessonData) => {
	const [resources, setResources] = useState<Resource[]>(() =>
		Array.isArray(initialLesson.resources)
			? (initialLesson.resources as Resource[])
			: [],
	);

	const addResource = () => {
		setResources((prev) => [
			...prev,
			{
				id: Date.now().toString(),
				name: "New Resource",
				type: "PDF",
				url: "#",
			},
		]);
	};

	const removeResource = (id: string) => {
		setResources((prev) => prev.filter((r) => r.id !== id));
	};

	const updateResource = (id: string, changes: Partial<Resource>) => {
		setResources((prev) =>
			prev.map((r) => (r.id === id ? { ...r, ...changes } : r)),
		);
	};

	return { resources, addResource, removeResource, updateResource };
};
