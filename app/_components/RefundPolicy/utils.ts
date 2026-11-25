import {
	CalendarClock,
	CircleHelp,
	type LucideIcon,
	MousePointerClick,
	RotateCcw,
} from "lucide-react";
import type { RefundPolicySectionId } from "@/server/entities/refund/refundPolicy";

export const SECTION_ICON: Record<RefundPolicySectionId, LucideIcon> = {
	when: CalendarClock,
	how: MousePointerClick,
	appeal: CircleHelp,
	after: RotateCcw,
};

/** FR-P21: the three terms a student needs first; the sections below give the full rules. */
export const QUICK_FACTS = [
	{ value: "14 days", label: "from the day you pay" },
	{ value: "≤ 3 lessons", label: "opened, and no more than half" },
	{ value: "Once", label: "per course" },
] as const;

export const PURCHASES_HREF = "/dashboard/billing";
