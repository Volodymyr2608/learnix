export const toSlug = (cat: string): string =>
	cat.toLowerCase().replace(/\s+/g, "-");

export const buildCategoryHref = (cat: string, q: string): string => {
	const params = new URLSearchParams();
	if (q) params.set("q", q);
	if (cat !== "All") params.set("category", toSlug(cat));
	const qs = params.toString();
	return `/dashboard/browse${qs ? `?${qs}` : ""}`;
};
