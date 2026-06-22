import type { PreviewSection } from "../CourseContentCard/types";

export type PricingSidebarProps = {
	priceCents: number;
	originalPriceCents: number | null;
	sections: PreviewSection[];
};

export type DiscountBadgeProps = {
	percent: number;
};
