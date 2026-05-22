import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { COURSE_CATEGORIES } from "@/lib/constants/courseCategories";

export const lookupCategoryTaxonomyTool = tool(
	async () => {
		return JSON.stringify({
			categories: COURSE_CATEGORIES.map((c) => ({
				value: c.value,
				label: c.label,
			})),
		});
	},
	{
		name: "lookup_category_taxonomy",
		description:
			"Return the canonical list of course categories supported by the platform. Use this to pick a valid category value instead of inventing one.",
		schema: z.object({}),
	},
);